import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import type { Activite } from '../../types';

const apiMsg = (e: unknown, fallback = 'Erreur') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

const fmtMoney = (n: number | null | undefined) => {
  if (n == null) return '—';
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' DT';
};

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';

interface ActivitePrestataire {
  id: string;
  activite_id: number;
  prestataire_id: string;
  taux_commission: number;
  actif: boolean;
  prestataire_nom: string;
  logo_url?: string | null;
}

interface PrestataireGlobal {
  id: string;
  nom: string;
  actif: boolean;
}

interface ArticleVendable {
  id: string;
  nom: string;
  article_type: string;
  prix_vente: number;
  unite_nom?: string | null;
}

interface ArticlePrixPrestataire {
  id: string;
  article_vendable_id: string;
  activite_prestataire_id: string;
  prix_vente: number | null;
  prix_base: number;
  taux_commission: number;
  prestataire_nom: string;
  article_nom: string;
  prestataire_id: string;
}

interface ChargesFixes {
  id?: string;
  activite_id?: number;
  mode: 'global' | 'detail';
  montant_global?: number | null;
  loyer?: number | null;
  charges_personnel?: number | null;
  electricite_gaz?: number | null;
  eau?: number | null;
}

export default function ConfigurationVentePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);

  // Prestataires par activité
  const [activitePrestataires, setActivitePrestataires] = useState<ActivitePrestataire[]>([]);
  const [allPrestataires, setAllPrestataires] = useState<PrestataireGlobal[]>([]);

  // Prix prestataire
  const [articlesVendables, setArticlesVendables] = useState<ArticleVendable[]>([]);
  const [prixPrestataires, setPrixPrestataires] = useState<ArticlePrixPrestataire[]>([]);

  // Charges fixes
  const [charges, setCharges] = useState<ChargesFixes | null>(null);

  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'prestataires' | 'prix' | 'charges'>('prestataires');

  // Add prestataire form
  const [showAddPrest, setShowAddPrest] = useState(false);
  const [newPrestId, setNewPrestId] = useState('');
  const [newTaux, setNewTaux] = useState('0');
  const [addPrestError, setAddPrestError] = useState('');

  // Edit taux form
  const [editTauxId, setEditTauxId] = useState<string | null>(null);
  const [editTauxVal, setEditTauxVal] = useState('');

  // Prix edit
  const [editingPrix, setEditingPrix] = useState<Record<string, string>>({});

  // Charges form
  const [chargesForm, setChargesForm] = useState<ChargesFixes>({ mode: 'global' });
  const [chargesSaving, setChargesSaving] = useState(false);
  const [chargesError, setChargesError] = useState('');

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => {
      const acts = data as Activite[];
      setActivites(acts);
      const paramId = searchParams.get('activiteId');
      const found = acts.find(a => String(a.id) === paramId);
      setSelectedActiviteId(found ? found.id : acts[0]?.id ?? null);
    }).catch(() => {});
    api.get('/api/prestataires').then(({ data }) => setAllPrestataires(data)).catch(() => {});
  }, []);

  const loadAll = useCallback(() => {
    if (!selectedActiviteId) return;
    Promise.all([
      api.get(`/api/activite-prestataires?activiteId=${selectedActiviteId}`),
      api.get(`/api/articles-vendables?activiteId=${selectedActiviteId}`),
      api.get(`/api/article-prix-prestataire?activiteId=${selectedActiviteId}`),
      api.get(`/api/charges-fixes?activiteId=${selectedActiviteId}`),
    ]).then(([ap, av, pp, ch]) => {
      setActivitePrestataires(ap.data);
      setArticlesVendables((av.data as ArticleVendable[]).filter(a => a.article_type === 'ingredient'));
      setPrixPrestataires(pp.data);
      const chData = ch.data as ChargesFixes | null;
      setCharges(chData);
      setChargesForm(chData || { mode: 'global' });
    }).catch(() => {});
  }, [selectedActiviteId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleAddPrestataire = async () => {
    if (!selectedActiviteId || !newPrestId) return;
    setSaving(true); setAddPrestError('');
    try {
      await api.post('/api/activite-prestataires', {
        activite_id: selectedActiviteId,
        prestataire_id: newPrestId,
        taux_commission: parseFloat(newTaux) || 0,
      });
      setShowAddPrest(false); setNewPrestId(''); setNewTaux('0');
      loadAll();
    } catch (e: unknown) {
      setAddPrestError(apiMsg(e));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTaux = async (id: string) => {
    setSaving(true);
    try {
      await api.put(`/api/activite-prestataires/${id}`, { taux_commission: parseFloat(editTauxVal) || 0 });
      setEditTauxId(null);
      loadAll();
    } catch {} finally {
      setSaving(false);
    }
  };

  const handleTogglePrestataire = async (id: string, actif: boolean) => {
    try {
      await api.put(`/api/activite-prestataires/${id}`, { actif: !actif });
      loadAll();
    } catch {}
  };

  const handleRemovePrestataire = async (id: string) => {
    if (!confirm('Retirer ce prestataire de cette activité ?')) return;
    try {
      await api.delete(`/api/activite-prestataires/${id}`);
      loadAll();
    } catch {}
  };

  const getPrixKey = (articleId: string, apId: string) => `${articleId}__${apId}`;

  const handleSavePrix = async (articleId: string, apId: string) => {
    const key = getPrixKey(articleId, apId);
    const val = editingPrix[key];
    if (!val) return;
    setSaving(true);
    try {
      await api.post('/api/article-prix-prestataire', {
        article_vendable_id: articleId,
        activite_prestataire_id: apId,
        prix_vente: parseFloat(val),
      });
      const newEdit = { ...editingPrix };
      delete newEdit[key];
      setEditingPrix(newEdit);
      loadAll();
    } catch {} finally {
      setSaving(false);
    }
  };

  const handleSaveCharges = async () => {
    if (!selectedActiviteId) return;
    setChargesSaving(true); setChargesError('');
    try {
      await api.post('/api/charges-fixes', { ...chargesForm, activite_id: selectedActiviteId });
      loadAll();
    } catch (e: unknown) {
      setChargesError(apiMsg(e));
    } finally {
      setChargesSaving(false);
    }
  };

  const totalCharges = chargesForm.mode === 'global'
    ? chargesForm.montant_global ?? 0
    : (chargesForm.loyer ?? 0) + (chargesForm.charges_personnel ?? 0) + (chargesForm.electricite_gaz ?? 0) + (chargesForm.eau ?? 0);

  const alreadyAdded = new Set(activitePrestataires.map(ap => ap.prestataire_id));
  const availablePrestataires = allPrestataires.filter(p => p.actif && !alreadyAdded.has(p.id));

  const sectionBtn = (key: typeof activeSection, label: string) => (
    <button onClick={() => setActiveSection(key)}
      style={{
        padding: '8px 18px', background: activeSection === key ? C : 'var(--card-bg)',
        color: activeSection === key ? '#fff' : 'var(--text)',
        border: activeSection === key ? `1.5px solid ${C}` : '1.5px solid var(--border)',
        borderRadius: 9, cursor: 'pointer', fontWeight: activeSection === key ? 700 : 400, fontSize: '0.88rem',
      }}>
      {label}
    </button>
  );

  return (
    <div className="page-content">
      {/* Hero */}
      <div style={{
        background: `linear-gradient(135deg, ${CD} 0%, ${C} 55%, #d97706 100%)`,
        borderRadius: 18, padding: '24px 28px', marginBottom: 24,
        boxShadow: '0 8px 32px rgba(180,83,9,0.28)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>⚙️</div>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Configuration Vente</h1>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
          Prestataires, prix par prestataire et charges fixes
        </p>
      </div>

      {/* Activité selector */}
      {activites.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600, marginRight: 4 }}>Activité :</span>
          {activites.map(a => (
            <button key={a.id} onClick={() => { setSelectedActiviteId(a.id); setSearchParams({ activiteId: String(a.id) }); }}
              style={{
                padding: '5px 14px', borderRadius: 20, cursor: 'pointer', fontSize: '0.83rem',
                border: selectedActiviteId === a.id ? `1.5px solid ${C}` : '1px solid var(--border)',
                background: selectedActiviteId === a.id ? C : 'var(--card-bg)',
                color: selectedActiviteId === a.id ? '#fff' : 'var(--text)',
                fontWeight: selectedActiviteId === a.id ? 700 : 400, transition: 'all 0.15s',
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
          {/* Section tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
            {sectionBtn('prestataires', '🛵 Prestataires')}
            {sectionBtn('prix', '💲 Prix prestataires')}
            {sectionBtn('charges', '🏗️ Charges fixes')}
          </div>

          {/* ── PRESTATAIRES ── */}
          {activeSection === 'prestataires' && (
            <div style={{ background: 'var(--card-bg)', borderRadius: 14, border: `1.5px solid ${CB}`, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: C, margin: 0 }}>🛵 Prestataires de l'activité</h2>
                <button onClick={() => { setShowAddPrest(true); setAddPrestError(''); }}
                  style={{ background: `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                  + Ajouter
                </button>
              </div>

              {activitePrestataires.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0' }}>
                  Aucun prestataire configuré pour cette activité
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {activitePrestataires.map(ap => (
                    <div key={ap.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: ap.actif ? CL : 'var(--bg)', borderRadius: 10, border: `1px solid ${ap.actif ? CB : 'var(--border)'}` }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: C + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>🛵</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{ap.prestataire_nom}</div>
                        {editTauxId === ap.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                            <input type="number" min="0" max="100" step="0.1" value={editTauxVal}
                              onChange={e => setEditTauxVal(e.target.value)}
                              style={{ width: 80, padding: '3px 8px', borderRadius: 6, border: `1px solid ${CB}`, background: CL, fontSize: '0.85rem' }} />
                            <span style={{ fontSize: '0.82rem' }}>%</span>
                            <button onClick={() => handleUpdateTaux(ap.id)} disabled={saving}
                              style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: C, color: '#fff', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>OK</button>
                            <button onClick={() => setEditTauxId(null)}
                              style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.78rem' }}>✕</button>
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                            Commission : <strong style={{ color: C }}>{ap.taux_commission}%</strong>
                            <button onClick={() => { setEditTauxId(ap.id); setEditTauxVal(String(ap.taux_commission)); }}
                              style={{ padding: '1px 8px', borderRadius: 5, border: `1px solid ${CB}`, background: CL, color: CD, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600 }}>
                              Modifier
                            </button>
                          </div>
                        )}
                      </div>
                      <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '0.75rem', background: ap.actif ? '#dcfce7' : '#f3f4f6', color: ap.actif ? '#166534' : '#6b7280' }}>
                        {ap.actif ? '✓ Actif' : 'Inactif'}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => handleTogglePrestataire(ap.id, ap.actif)}
                          style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '0.78rem' }}>
                          {ap.actif ? 'Désactiver' : 'Activer'}
                        </button>
                        <button onClick={() => handleRemovePrestataire(ap.id)}
                          style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #dc2626', color: '#dc2626', background: 'none', cursor: 'pointer', fontSize: '0.78rem' }}>
                          Retirer
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── PRIX PAR PRESTATAIRE ── */}
          {activeSection === 'prix' && (
            <div style={{ background: 'var(--card-bg)', borderRadius: 14, border: `1.5px solid ${CB}`, padding: 24 }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: C, marginBottom: 6 }}>💲 Prix par prestataire</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 18 }}>
                Le prix est calculé automatiquement depuis le prix de base et la commission. Vous pouvez le modifier manuellement.
              </p>

              {activitePrestataires.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0' }}>
                  Configurez d'abord vos prestataires dans l'onglet Prestataires.
                </div>
              ) : articlesVendables.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px 0' }}>
                  Configurez d'abord votre catalogue vendable.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
                    <thead>
                      <tr style={{ background: CL, borderBottom: `1.5px solid ${CB}` }}>
                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.82rem', fontWeight: 700, color: C }}>Ingrédient</th>
                        <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '0.82rem', fontWeight: 700, color: C }}>Prix base</th>
                        {activitePrestataires.filter(ap => ap.actif).map(ap => (
                          <th key={ap.id} style={{ padding: '10px 14px', textAlign: 'center', fontSize: '0.82rem', fontWeight: 700, color: C }}>
                            {ap.prestataire_nom}<br />
                            <span style={{ fontSize: '0.72rem', fontWeight: 400 }}>(-{ap.taux_commission}%)</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {articlesVendables.map(av => (
                        <tr key={av.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', fontWeight: 600 }}>
                            {av.nom}
                            {av.unite_nom && <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}> ({av.unite_nom})</span>}
                          </td>
                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: C }}>{fmtMoney(av.prix_vente)}</td>
                          {activitePrestataires.filter(ap => ap.actif).map(ap => {
                            const key = getPrixKey(av.id, ap.id);
                            const existingRecord = prixPrestataires.find(p => p.article_vendable_id === av.id && p.activite_prestataire_id === ap.id);
                            const autoCalc = av.prix_vente * (1 - ap.taux_commission / 100);
                            const currentVal = key in editingPrix ? editingPrix[key] : (existingRecord?.prix_vente != null ? String(existingRecord.prix_vente) : '');
                            const isDirty = key in editingPrix;
                            return (
                              <td key={ap.id} style={{ padding: '8px 14px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                                  <input type="number" min="0" step="0.01"
                                    value={currentVal}
                                    placeholder={autoCalc.toFixed(2)}
                                    onChange={e => setEditingPrix(prev => ({ ...prev, [key]: e.target.value }))}
                                    style={{ width: 80, padding: '4px 6px', borderRadius: 6, border: `1px solid ${isDirty ? C : CB}`, background: isDirty ? CL : 'var(--bg)', textAlign: 'right', fontSize: '0.85rem' }} />
                                  {isDirty && (
                                    <button onClick={() => handleSavePrix(av.id, ap.id)} disabled={saving}
                                      style={{ padding: '3px 8px', borderRadius: 5, border: 'none', background: C, color: '#fff', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>✓</button>
                                  )}
                                </div>
                                {!isDirty && existingRecord?.prix_vente == null && (
                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>auto: {autoCalc.toFixed(2)}</div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── CHARGES FIXES ── */}
          {activeSection === 'charges' && (
            <div style={{ background: 'var(--card-bg)', borderRadius: 14, border: `1.5px solid ${CB}`, padding: 24 }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: C, marginBottom: 6 }}>🏗️ Charges fixes annuelles</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginBottom: 20 }}>
                Utilisées pour calculer le seuil de rentabilité et le rapport vente.
              </p>

              {/* Mode toggle */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                {(['global', 'detail'] as const).map(m => (
                  <button key={m} onClick={() => setChargesForm(f => ({ ...f, mode: m }))}
                    style={{
                      padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: chargesForm.mode === m ? 700 : 400, fontSize: '0.88rem',
                      background: chargesForm.mode === m ? C : 'var(--bg)',
                      color: chargesForm.mode === m ? '#fff' : 'var(--text)',
                      border: chargesForm.mode === m ? `1.5px solid ${C}` : '1.5px solid var(--border)',
                    }}>
                    {m === 'global' ? '📊 Montant global' : '📋 Détail par poste'}
                  </button>
                ))}
              </div>

              {chargesForm.mode === 'global' ? (
                <div style={{ maxWidth: 340 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 6 }}>Charges fixes annuelles totales (DT)</label>
                  <input type="number" min="0" step="100" value={chargesForm.montant_global ?? ''}
                    onChange={e => setChargesForm(f => ({ ...f, montant_global: e.target.value ? parseFloat(e.target.value) : null }))}
                    placeholder="0.00"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL, fontSize: '1rem', fontWeight: 600 }} />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  {([
                    { key: 'loyer' as const, label: '🏠 Loyer', icon: '🏠' },
                    { key: 'charges_personnel' as const, label: '👥 Charges personnel', icon: '👥' },
                    { key: 'electricite_gaz' as const, label: '⚡ Électricité / Gaz', icon: '⚡' },
                    { key: 'eau' as const, label: '💧 Eau', icon: '💧' },
                  ] as const).map(({ key, label }) => (
                    <div key={key}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>{label} (DT/an)</label>
                      <input type="number" min="0" step="100" value={chargesForm[key] ?? ''}
                        onChange={e => setChargesForm(f => ({ ...f, [key]: e.target.value ? parseFloat(e.target.value) : null }))}
                        placeholder="0.00"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL }} />
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 20, padding: '12px 16px', background: CL, borderRadius: 10, border: `1px solid ${CB}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: CD }}>Total charges annuelles</span>
                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: C }}>{fmtMoney(totalCharges)}</span>
              </div>

              {chargesError && <div style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: 10 }}>{chargesError}</div>}

              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleSaveCharges} disabled={chargesSaving}
                  style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`, color: '#fff', cursor: 'pointer', fontWeight: 700, opacity: chargesSaving ? 0.6 : 1 }}>
                  {chargesSaving ? 'Enregistrement…' : charges ? 'Mettre à jour' : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal ajout prestataire */}
      {showAddPrest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--card-bg)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 380 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: C, marginBottom: 20 }}>Ajouter un prestataire</h2>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Prestataire</label>
              <select value={newPrestId} onChange={e => setNewPrestId(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL }}>
                <option value="">-- Sélectionner --</option>
                {availablePrestataires.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </select>
              {availablePrestataires.length === 0 && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>Tous les prestataires actifs sont déjà configurés.</p>
              )}
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>Taux de commission (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={newTaux} onChange={e => setNewTaux(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${CB}`, background: CL }} />
            </div>
            {addPrestError && <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 10 }}>{addPrestError}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddPrest(false)}
                style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleAddPrestataire} disabled={saving || !newPrestId}
                style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`, color: '#fff', cursor: 'pointer', fontWeight: 700, opacity: saving || !newPrestId ? 0.6 : 1 }}>
                {saving ? 'Enregistrement…' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
