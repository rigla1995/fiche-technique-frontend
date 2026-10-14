import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import GuideButton from './GuideButton';
import { useConfirm } from '../common/ConfirmDialog';
import type { Activite } from '../../types';
import { useVocabulaire } from '../../hooks/useVocabulaire';

// P2 « Conditions des prestataires et chiffre net » (labflow-reprise/produits-prestataires/PLAN.md §2 ligne P2 ; réponses
// du client du 13/10) : activer un prestataire pour une activité demande ses CONDITIONS — commission (%), TVA (%) sur la
// commission, mode de paiement (liste de l'admin) — modifiables ensuite ; chaque vente les fige le jour de sa saisie.
// Désactiver efface les conditions et les prix du prestataire pour l'activité : l'écran prévient avant.

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
  taux_commission: number;
  taux_tva: number;
  mode_paiement_id: number | null;
  mode_paiement_libelle: string | null;
  /** false : prestataire activé avant P2, conditions encore à renseigner (la saisie de ventes sur ce canal est refusée). */
  conditions_renseignees: boolean;
}

interface PrestataireGlobal {
  id: string;
  nom: string;
  actif: boolean;
}

interface ModePaiement { id: number; libelle: string }

const fmtPct = (n: number) => `${Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;
const apiMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

export default function ConfigPrestatairesPage() {
  const voc = useVocabulaire();
  const { confirm, alerte } = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activites, setActivites] = useState<Activite[]>([]);
  const [selectedActiviteId, setSelectedActiviteId] = useState<number | null>(null);
  const [activitePrestataires, setActivitePrestataires] = useState<ActivitePrestataire[]>([]);
  const [allPrestataires, setAllPrestataires] = useState<PrestataireGlobal[]>([]);
  const [modes, setModes] = useState<ModePaiement[]>([]);
  // Nombre de prix prestataire configurés, par lien (pour prévenir avant de désactiver).
  const [nbPrix, setNbPrix] = useState<Record<string, number>>({});
  const [toggling, setToggling] = useState<string | null>(null);

  // Fenêtre des conditions : à l'activation (lien null) ou pour modifier (lien existant).
  const [fenetre, setFenetre] = useState<{ prestataire: PrestataireGlobal; lien: ActivitePrestataire | null } | null>(null);
  const [fCommission, setFCommission] = useState('');
  const [fTva, setFTva] = useState('');
  const [fMode, setFMode] = useState('');
  const [fSaving, setFSaving] = useState(false);
  const [fError, setFError] = useState('');

  useEffect(() => {
    api.get('/api/entreprise/activites').then(({ data }) => {
      // Règle vente V1 (lot 1b) : seules les activités vendeuses (vente_active) ont des puces ici.
      const acts = (data as (Activite & { venteActive?: boolean })[]).filter((a) => a.venteActive !== false);
      setActivites(acts);
      const paramId = searchParams.get('activiteId');
      const found = acts.find(a => String(a.id) === paramId);
      setSelectedActiviteId(found ? found.id : acts[0]?.id ?? null);
    }).catch(() => {});
    api.get('/api/prestataires').then(({ data }) => setAllPrestataires(data)).catch(() => {});
    api.get('/api/modes-paiement').then(({ data }) => setModes(data as ModePaiement[])).catch(() => setModes([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = useCallback(() => {
    if (!selectedActiviteId) return;
    api.get(`/api/activite-prestataires?activiteId=${selectedActiviteId}`)
      .then(({ data }) => setActivitePrestataires(data))
      .catch(() => {});
    api.get(`/api/article-prix-prestataire?activiteId=${selectedActiviteId}`)
      .then(({ data }) => {
        const n: Record<string, number> = {};
        for (const p of data as { activite_prestataire_id: string; prix_vente: number | null }[]) {
          if (p.prix_vente != null) n[p.activite_prestataire_id] = (n[p.activite_prestataire_id] ?? 0) + 1;
        }
        setNbPrix(n);
      })
      .catch(() => setNbPrix({}));
  }, [selectedActiviteId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const ouvrirFenetre = (prestataire: PrestataireGlobal, lien: ActivitePrestataire | null) => {
    setFCommission(lien ? String(lien.taux_commission) : '');
    setFTva(lien ? String(lien.taux_tva) : '');
    setFMode(lien?.mode_paiement_id ? String(lien.mode_paiement_id) : (modes.length === 1 ? String(modes[0].id) : ''));
    setFError('');
    setFenetre({ prestataire, lien });
  };

  const handleToggle = async (prestataire: PrestataireGlobal) => {
    if (!selectedActiviteId || toggling) return;
    const existing = activitePrestataires.find(ap => ap.prestataire_id === prestataire.id);
    if (!existing) { ouvrirFenetre(prestataire, null); return; }
    // Désactiver efface les conditions et les prix du prestataire pour l'activité (question 5 du plan).
    const n = nbPrix[existing.id] ?? 0;
    const ok = await confirm({
      title: `Désactiver ${prestataire.nom} pour ${voc.ce('activite')} ?`,
      message: existing.conditions_renseignees || n > 0
        ? `Ses conditions (commission, TVA, mode de paiement)${n > 0 ? ` et ses ${n} prix` : ''} seront ${voc.acc('prestataire', 'effacés', 'effacés')}. Vous devrez les ressaisir pour le réactiver. ${voc.Le('vente', true)} déjà ${voc.acc('vente', 'enregistrés', 'enregistrées')} ne changent pas.`
        : `${voc.Le('vente', true)} déjà ${voc.acc('vente', 'enregistrés', 'enregistrées')} ne changent pas.`,
      confirmLabel: 'Désactiver',
      tone: 'danger',
    });
    if (!ok) return;
    setToggling(prestataire.id);
    try {
      await api.delete(`/api/activite-prestataires/${existing.id}`);
      loadAll();
    } catch (e: unknown) {
      alerte({ title: 'Désactivation impossible', message: apiMsg(e, 'Erreur serveur'), tone: 'danger' });
    } finally {
      setToggling(null);
    }
  };

  const tauxOk = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) && n >= 0 && n <= 100; };
  const fenetreValide = tauxOk(fCommission) && tauxOk(fTva) && fMode !== '';

  const enregistrerConditions = async () => {
    if (!fenetre || !selectedActiviteId || !fenetreValide) return;
    setFSaving(true); setFError('');
    const corps = {
      taux_commission: parseFloat(fCommission.replace(',', '.')),
      taux_tva: parseFloat(fTva.replace(',', '.')),
      mode_paiement_id: parseInt(fMode, 10),
    };
    try {
      if (fenetre.lien) await api.put(`/api/activite-prestataires/${fenetre.lien.id}`, corps);
      else await api.post('/api/activite-prestataires', { activite_id: selectedActiviteId, prestataire_id: fenetre.prestataire.id, ...corps });
      setFenetre(null);
      loadAll();
    } catch (e: unknown) {
      setFError(apiMsg(e, 'Erreur serveur'));
    } finally {
      setFSaving(false);
    }
  };

  const activeCount = activitePrestataires.length;
  const aRenseigner = activitePrestataires.filter(ap => !ap.conditions_renseignees).length;
  const selectedActivite = activites.find(a => a.id === selectedActiviteId);

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
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>{voc.icon('prestataire')}</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>
              Config {voc.Court('prestataire', true)}
            </h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.82)', margin: 0, fontSize: '0.85rem' }}>
            Activez {voc.le('prestataire', true)} de livraison pour {voc.ce('activite')}, avec leur commission, la TVA et le mode de paiement
          </p>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.18)', borderRadius: 12, padding: '10px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>{activeCount}</div>
          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)' }}>{voc.nom('prestataire', activeCount !== 1)} {voc.acc('prestataire', 'actif', 'active', activeCount !== 1)}</div>
        </div>
        <GuideButton section="configuration-vente" />
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
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>← sélectionner {voc.le('activite')}</span>
        </div>
      )}

      {aRenseigner > 0 && (
        <div style={{ background: '#fef3c7', border: '1.5px solid #fcd34d', borderRadius: 10, padding: '10px 16px', marginBottom: 16, fontSize: '0.84rem', color: '#92400e', fontWeight: 600 }}>
          ⚠ {aRenseigner} {voc.nom('prestataire', aRenseigner !== 1)} sans conditions : renseignez la commission, la TVA et le mode de paiement, sinon la saisie {voc.du('vente', true)} sur ce canal est refusée.
        </div>
      )}

      {!selectedActiviteId ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>{voc.Aucun('activite')} disponible</div>
      ) : allPrestataires.filter(p => p.actif).length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>{voc.icon('prestataire')}</div>
          <div>{voc.Aucun('prestataire')} disponible — contactez l'administrateur</div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 16, border: `1.5px solid ${CB}`, overflow: 'hidden', boxShadow: '0 4px 20px rgba(180,83,9,0.08)' }}>
          <div style={{ background: `linear-gradient(135deg, ${CD}18 0%, ${C}12 100%)`, borderBottom: `1.5px solid ${CB}`, padding: '16px 24px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: C, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              {voc.Pl('prestataire')} disponibles — activez {voc.acc('prestataire', 'ceux', 'celles')} que vous utilisez
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
                  transition: 'all 0.15s', flexWrap: 'wrap',
                }}>
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: isActive ? C + '22' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
                    {voc.icon('prestataire')}
                  </div>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: isActive ? CD : '#374151' }}>{p.nom}</div>
                    {!isActive ? (
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 2 }}>
                        {voc.acc('prestataire', 'Inactif', 'Inactive')} pour {voc.ce('activite')}
                      </div>
                    ) : linked.conditions_renseignees ? (
                      <div style={{ fontSize: '0.78rem', color: C, marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ background: '#fff', border: `1px solid ${CB}`, borderRadius: 20, padding: '1px 9px', fontWeight: 700 }}>Commission {fmtPct(linked.taux_commission)}</span>
                        <span style={{ background: '#fff', border: `1px solid ${CB}`, borderRadius: 20, padding: '1px 9px', fontWeight: 700 }}>TVA {fmtPct(linked.taux_tva)} sur la commission</span>
                        <span style={{ background: '#fff', border: `1px solid ${CB}`, borderRadius: 20, padding: '1px 9px', fontWeight: 700 }}>💳 {linked.mode_paiement_libelle ?? '—'}</span>
                        {(nbPrix[linked.id] ?? 0) > 0 && <span style={{ color: '#9ca3af' }}>· {nbPrix[linked.id]} prix</span>}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.78rem', color: '#92400e', marginTop: 3, fontWeight: 700 }}>
                        ⚠ Conditions à renseigner (commission, TVA, mode de paiement)
                      </div>
                    )}
                  </div>
                  {isActive && (
                    <button type="button" onClick={() => ouvrirFenetre(p, linked)}
                      style={{ border: `1.5px solid ${linked.conditions_renseignees ? CB : '#f59e0b'}`, background: linked.conditions_renseignees ? '#fff' : '#fef3c7', color: CD, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                      {linked.conditions_renseignees ? '✏️ Modifier les conditions' : '➕ Renseigner les conditions'}
                    </button>
                  )}
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
                    title={isActive ? `Désactiver ${voc.ce('prestataire')}` : `Activer ${voc.ce('prestataire')}`}
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

      {/* Fenêtre des conditions (activation ou modification) */}
      {fenetre && (
        <div className="modal-overlay">
          <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
            <div className="modal-header modal-header--primary" style={{ background: `linear-gradient(135deg, ${CD}, ${C})` }}>
              <h2>{fenetre.lien ? 'Conditions de' : 'Activer'} {fenetre.prestataire.nom}{selectedActivite ? ` — ${selectedActivite.nom}` : ''}</h2>
              <button className="modal-close" onClick={() => setFenetre(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                Ces conditions servent au chiffre net du tableau de bord : net = prix {voc.de('vente')} − commission − TVA sur la commission.
                Chaque {voc.nom('vente')} garde les conditions du jour de la saisie.
              </p>
              {fError && (
                <div style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>
                  ⚠️ {fError}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Commission (%) *</label>
                  <input type="number" min="0" max="100" step="0.01" className="input" autoFocus value={fCommission}
                    onChange={e => setFCommission(e.target.value)} placeholder="Ex. 25" />
                </div>
                <div className="form-group">
                  <label>TVA sur la commission (%) *</label>
                  <input type="number" min="0" max="100" step="0.01" className="input" value={fTva}
                    onChange={e => setFTva(e.target.value)} placeholder="Ex. 19" />
                </div>
              </div>
              <div className="form-group">
                <label>Mode de paiement *</label>
                <select className="input" value={fMode} onChange={e => setFMode(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {modes.map(m => <option key={m.id} value={m.id}>{m.libelle}</option>)}
                </select>
                {modes.length === 0 && <div style={{ fontSize: '0.75rem', color: '#b45309', marginTop: 4 }}>Aucun mode de paiement : contactez l'administrateur.</div>}
              </div>
              {fenetreValide && (() => {
                const com = 100 * parseFloat(fCommission.replace(',', '.')) / 100;
                const tva = com * parseFloat(fTva.replace(',', '.')) / 100;
                return (
                  <div style={{ background: CL, border: `1px solid ${CB}`, borderRadius: 8, padding: '8px 12px', fontSize: '0.8rem', color: CD }}>
                    Exemple : sur 100 DT {voc.de('vente', true)}, commission {com.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} DT, TVA {tva.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} DT,
                    <strong> net {(100 - com - tva).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} DT</strong>.
                  </div>
                );
              })()}
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setFenetre(null)}>Annuler</button>
                <button type="button" className="btn btn-primary" disabled={fSaving || !fenetreValide} onClick={enregistrerConditions}
                  style={{ background: C, borderColor: C }}>
                  {fSaving ? 'Enregistrement…' : fenetre.lien ? 'Enregistrer' : 'Activer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
