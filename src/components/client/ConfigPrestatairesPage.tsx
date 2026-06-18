import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import type { Activite } from '../../types';

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';

interface ActivitePrestataire {
  id: string;
  activite_id: number;
  prestataire_id: string;
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
  const [toggling, setToggling] = useState<string | null>(null);

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

  const handleToggle = async (prestataire: PrestataireGlobal) => {
    if (!selectedActiviteId || toggling) return;
    const existing = activitePrestataires.find(ap => ap.prestataire_id === prestataire.id);
    setToggling(prestataire.id);
    try {
      if (existing) {
        await api.delete(`/api/activite-prestataires/${existing.id}`);
      } else {
        await api.post('/api/activite-prestataires', {
          activite_id: selectedActiviteId,
          prestataire_id: prestataire.id,
          taux_commission: 0,
        });
      }
      loadAll();
    } catch {
      // ignore
    } finally {
      setToggling(null);
    }
  };

  const activeCount = activitePrestataires.length;

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
            Activez les prestataires de livraison pour cette activité
          </p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>{activeCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)' }}>prestataire{activeCount !== 1 ? 's' : ''} actif{activeCount !== 1 ? 's' : ''}</div>
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
      ) : allPrestataires.filter(p => p.actif).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🛵</div>
          <div>Aucun prestataire disponible — contactez l'administrateur</div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 16, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 4px 20px rgba(180,83,9,0.08)' }}>
          <div style={{ background: `linear-gradient(135deg, ${CD}18 0%, ${C}12 100%)`, borderBottom: `1.5px solid ${CB}`, padding: '16px 24px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: C, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Prestataires disponibles — activez ceux que vous utilisez
            </div>
          </div>
          <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {allPrestataires.filter(p => p.actif).map(p => {
              const linked = activitePrestataires.find(ap => ap.prestataire_id === p.id);
              const isActive = !!linked;
              const isLoading = toggling === p.id;
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
                  background: isActive ? CL : '#fafafa',
                  borderRadius: 12,
                  border: `1.5px solid ${isActive ? CB : '#e5e7eb'}`,
                  transition: 'all 0.15s',
                }}>
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: isActive ? C + '22' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
                    🛵
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: isActive ? CD : '#374151' }}>{p.nom}</div>
                    <div style={{ fontSize: '0.75rem', color: isActive ? C : '#9ca3af', marginTop: 2 }}>
                      {isActive ? '✓ Actif pour cette activité — apparaît dans la config vente' : 'Inactif pour cette activité'}
                    </div>
                  </div>
                  {/* Toggle */}
                  <button
                    disabled={isLoading}
                    onClick={() => handleToggle(p)}
                    style={{
                      width: 52, height: 28, borderRadius: 14, border: 'none', cursor: isLoading ? 'wait' : 'pointer',
                      background: isActive ? C : '#d1d5db',
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                      opacity: isLoading ? 0.6 : 1,
                    }}
                    title={isActive ? 'Désactiver ce prestataire' : 'Activer ce prestataire'}
                  >
                    <span style={{
                      position: 'absolute', top: 3,
                      left: isActive ? 26 : 3,
                      width: 22, height: 22, borderRadius: '50%',
                      background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                      transition: 'left 0.2s',
                      display: 'block',
                    }} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
