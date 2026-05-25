import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import type { Activite } from '../../types';

const apiMsg = (e: unknown, fallback = 'Erreur') =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

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
}

interface PrestataireGlobal {
  id: string;
  nom: string;
  actif: boolean;
}

export default function ConfigPrestatairesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const [activitePrestataires, setActivitePrestataires] = useState<ActivitePrestataire[]>([]);
  const [allPrestataires, setAllPrestataires] = useState<PrestataireGlobal[]>([]);
  const [saving, setSaving] = useState(false);
  const [showAddPrest, setShowAddPrest] = useState(false);
  const [newPrestId, setNewPrestId] = useState('');
  const [newTaux, setNewTaux] = useState('0');
  const [addPrestError, setAddPrestError] = useState('');
  const [editTauxId, setEditTauxId] = useState<string | null>(null);
  const [editTauxVal, setEditTauxVal] = useState('');

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
    api.get(`/api/activite-prestataires?activiteId=${selectedActiviteId}`)
      .then(({ data }) => setActivitePrestataires(data))
      .catch(() => {});
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
    } catch {} finally { setSaving(false); }
  };

  const handleRemovePrestataire = async (id: string) => {
    if (!confirm('Retirer ce prestataire de cette activité ?')) return;
    try {
      await api.delete(`/api/activite-prestataires/${id}`);
      loadAll();
    } catch {}
  };

  const alreadyAdded = new Set(activitePrestataires.map(ap => ap.prestataire_id));
  const availablePrestataires = allPrestataires.filter(p => p.actif && !alreadyAdded.has(p.id));

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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🛵</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              Config Prestataires
            </h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
            Gérez les prestataires de livraison et leurs taux de commission par activité
          </p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>{activitePrestataires.length}</div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)' }}>prestataire{activitePrestataires.length !== 1 ? 's' : ''} configuré{activitePrestataires.length !== 1 ? 's' : ''}</div>
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
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner l'activité</span>
        </div>
      )}

      {!selectedActiviteId ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>Aucune activité disponible</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 16, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 4px 20px rgba(180,83,9,0.08)' }}>
          {/* Section header */}
          <div style={{ background: `linear-gradient(135deg, ${CD}18 0%, ${C}12 100%)`, borderBottom: `1.5px solid ${CB}`, padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: C + '22', borderRadius: 8, padding: '6px 8px', fontSize: '1rem' }}>🛵</div>
              <div>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: CD }}>Prestataires configurés</div>
                <div style={{ fontSize: '0.72rem', color: C, fontWeight: 500 }}>
                  {activitePrestataires.length} prestataire{activitePrestataires.length !== 1 ? 's' : ''} pour cette activité
                </div>
              </div>
            </div>
            <button onClick={() => { setShowAddPrest(true); setAddPrestError(''); }}
              style={{ background: `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`, color: '#fff', border: 'none', borderRadius: 9, padding: '9px 20px', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', boxShadow: `0 2px 8px ${C}55` }}>
              + Ajouter un prestataire
            </button>
          </div>

          <div style={{ padding: 24 }}>
            {activitePrestataires.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>🛵</div>
                <div style={{ color: 'var(--text-muted)', marginBottom: 8 }}>Aucun prestataire configuré pour cette activité</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Ajoutez un prestataire pour configurer les prix et saisir des ventes via livraison</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {activitePrestataires.map(ap => (
                  <div key={ap.id} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
                    background: ap.actif ? CL : '#fafafa', borderRadius: 12,
                    border: `1.5px solid ${ap.actif ? CB : '#e5e7eb'}`,
                    transition: 'box-shadow 0.15s',
                  }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: C + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>🛵</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: CD }}>{ap.prestataire_nom}</div>
                      {editTauxId === ap.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                          <input type="number" min="0" max="100" step="0.1" value={editTauxVal}
                            onChange={e => setEditTauxVal(e.target.value)}
                            style={{ width: 80, padding: '4px 8px', borderRadius: 7, border: `1.5px solid ${C}`, background: CL, fontSize: '0.88rem', fontWeight: 600 }} />
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>%</span>
                          <button onClick={() => handleUpdateTaux(ap.id)} disabled={saving}
                            style={{ padding: '4px 12px', borderRadius: 7, border: 'none', background: C, color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}>✓ OK</button>
                          <button onClick={() => setEditTauxId(null)}
                            style={{ padding: '4px 10px', borderRadius: 7, border: `1px solid var(--border)`, background: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 8, alignItems: 'center' }}>
                          Commission :
                          <strong style={{ color: C, fontSize: '0.95rem' }}>{ap.taux_commission}%</strong>
                          <button onClick={() => { setEditTauxId(ap.id); setEditTauxVal(String(ap.taux_commission)); }}
                            style={{ padding: '3px 10px', borderRadius: 6, border: `1.5px solid ${C}`, background: CL, color: C, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}>
                            ✏️ Modifier
                          </button>
                        </div>
                      )}
                    </div>
                    <span style={{
                      padding: '3px 10px', borderRadius: 12, fontSize: '0.75rem', fontWeight: 600,
                      background: ap.actif ? '#dcfce7' : '#f3f4f6', color: ap.actif ? '#166534' : '#6b7280',
                    }}>
                      {ap.actif ? '✓ Actif' : 'Inactif'}
                    </span>
                    <button onClick={() => handleRemovePrestataire(ap.id)}
                      style={{ padding: '5px 12px', borderRadius: 8, border: '1.5px solid #dc2626', color: '#dc2626', background: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                      Retirer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal ajout prestataire */}
      {showAddPrest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddPrest(false); }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 440, boxShadow: '0 24px 64px rgba(120,53,15,0.28)', overflow: 'hidden' }}>
            <div style={{ background: `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 9, padding: '7px 9px', fontSize: '1.1rem' }}>🛵</div>
                <div>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem' }}>Ajouter un prestataire</div>
                  <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.78rem' }}>Lier un prestataire à cette activité</div>
                </div>
              </div>
              <button onClick={() => setShowAddPrest(false)}
                style={{ background: 'rgba(255,255,255,0.18)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '5px 9px', fontSize: '1rem', fontWeight: 700 }}>✕</button>
            </div>
            <div style={{ padding: '24px 24px 20px' }}>
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 7 }}>Prestataire</label>
                <select value={newPrestId} onChange={e => setNewPrestId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${CB}`, background: CL, color: CD, fontSize: '0.9rem', outline: 'none' }}>
                  <option value="">— Sélectionner —</option>
                  {availablePrestataires.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
                </select>
                {availablePrestataires.length === 0 && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 5 }}>Tous les prestataires actifs sont déjà configurés.</p>
                )}
              </div>
              <div style={{ marginBottom: 22 }}>
                <label style={{ fontSize: '0.72rem', fontWeight: 800, color: C, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 7 }}>Taux de commission</label>
                <div style={{ position: 'relative' }}>
                  <input type="number" min="0" max="100" step="0.1" value={newTaux} onChange={e => setNewTaux(e.target.value)}
                    style={{ width: '100%', padding: '10px 40px 10px 12px', borderRadius: 10, border: `1.5px solid ${CB}`, background: CL, color: CD, fontSize: '1rem', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }} />
                  <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: C, fontWeight: 700, fontSize: '0.95rem', pointerEvents: 'none' }}>%</span>
                </div>
              </div>
              {addPrestError && (
                <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 9, padding: '9px 13px', color: '#dc2626', fontSize: '0.82rem', marginBottom: 16 }}>
                  ⚠️ {addPrestError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowAddPrest(false)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: `1.5px solid ${CB}`, background: CL, color: CD, cursor: 'pointer', fontWeight: 600 }}>
                  Annuler
                </button>
                <button onClick={handleAddPrestataire} disabled={saving || !newPrestId}
                  style={{ flex: 2, padding: '10px 0', borderRadius: 10, border: 'none', background: saving || !newPrestId ? '#d1d5db' : `linear-gradient(135deg, ${CD} 0%, ${C} 100%)`, color: '#fff', cursor: saving || !newPrestId ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {saving ? 'Ajout…' : '🛵 Ajouter'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
