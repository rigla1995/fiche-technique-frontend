import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import ClientIdentiteForm from '../components/admin/ClientIdentiteForm';
import { controlerMatriculeFiscal } from '../components/admin/matriculeFiscal';
import { useConfirm } from '../components/common/ConfirmDialog';
import { IDENTITE_VIDE, corpsIdentite, formeIndividuelle, libelleForme, type IdentiteLegale } from '../utils/identiteLegale';
import { FormulaireExercice, FormulaireRegime } from './DossierFormulaires';
import {
  REGIME_DEFAUT, anneeCivile, controlerExercice, fmtDate, identifiantMatricule, libelleImpot, libellePersonne, libelleTva, lirePageDossiers,
  messageDossier, nbPeriodes, ouiNon, regimeParForme, type Exercice, type FicheDossier, type Regime,
} from './dossiers';

// Assistant « Nouveau dossier » (LabFlow Compta, étape S4a ; labflow-reprise/achats-compta/PLAN-S4.md §2) — même
// présentation que les assistants de LabFlow (NouveauComptableModal) : identité (formulaire et lecture de la patente de
// LabFlow, D17), régime fiscal (proposé d'après la forme juridique), premier exercice (année civile proposée, dates
// libres), récapitulatif. POST /api/compta/espaces/:espaceId/dossiers : le serveur crée le dossier, son exercice et ses
// périodes dans une transaction, puis la fiche s'ouvre.
const STEPS = ['Identité', 'Régime fiscal', 'Exercice', 'Récapitulatif'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 24 }}>
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? '#4338ca' : active ? '#6366f1' : '#e2e8f0', color: done || active ? '#fff' : '#9ca3af',
                fontSize: 13, fontWeight: 700, boxShadow: active ? '0 0 0 3px #c7d2fe' : 'none',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? '#4338ca' : done ? '#6366f1' : '#9ca3af', whiteSpace: 'nowrap' }}>{s}</span>
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: done ? '#6366f1' : '#e2e8f0', margin: '0 6px', marginBottom: 18 }} />}
          </div>
        );
      })}
    </div>
  );
}

// L'avertissement « matricule déjà porté » se donne dès l'étape Identité, lu au serveur parmi les dossiers ouverts à la
// personne (S4d : plus de liste chargée d'avance) ; le serveur le redit à la création.
export default function NouveauDossier({ espaceId, onClose, role = 'titulaire' }: { espaceId: number; onClose: () => void; role?: 'titulaire' | 'gerant' }) {
  const navigate = useNavigate();
  const { alerte } = useConfirm();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Le cadre reçoit le clavier à l'ouverture : Échap ferme (pas pendant la création).
  const cadre = useRef<HTMLDivElement>(null);
  useEffect(() => { cadre.current?.focus(); }, []);
  // Étape 1 — identité (la lecture de la patente remplit les champs vides)
  const [identite, setIdentite] = useState<IdentiteLegale>(IDENTITE_VIDE);
  const [lectureEnCours, setLectureEnCours] = useState(false);
  // Étape 2 — régime fiscal, proposé d'après la forme juridique tant que la personne n'y a pas touché
  const [regime, setRegime] = useState<Regime>(REGIME_DEFAUT);
  const [regimeTouche, setRegimeTouche] = useState(false);
  // Étape 3 — premier exercice : année civile en cours proposée
  const [exercice, setExercice] = useState<Exercice>(anneeCivile);

  const raison = (identite.raisonSociale ?? '').trim();
  const mf = controlerMatriculeFiscal(identite.matriculeFiscal);
  const step1Valid = raison.length > 0 && mf.ok && !lectureEnCours;
  const erreurExercice = controlerExercice(exercice);
  const nextDisabled = (step === 0 && !step1Valid) || (step === 2 && !!erreurExercice);
  const complete = !!(raison && identite.matriculeFiscal && identite.adresse && identite.ville);
  // Même identifiant de matricule qu'un dossier déjà visible : avertissement, jamais un refus (groupes, franchises). Lu
  // au serveur dès que l'identifiant a ses 7 chiffres (archivés compris, trois noms au plus), après une courte attente.
  const [doublons, setDoublons] = useState<{ idMf: string; noms: string[] }>({ idMf: '', noms: [] });
  const idMf = identifiantMatricule(identite.matriculeFiscal);
  const idMfValide = /^\d{7}$/.test(idMf);
  useEffect(() => {
    if (!idMfValide) return undefined;
    let annule = false;
    const t = setTimeout(() => {
      lirePageDossiers(espaceId, { matricule: idMf, archives: true, limite: 3 })
        .then((r) => { if (!annule) setDoublons({ idMf, noms: r.dossiers.map((d) => d.nom) }); })
        .catch(() => { if (!annule) setDoublons({ idMf, noms: [] }); });
    }, 300);
    return () => { annule = true; clearTimeout(t); };
  }, [espaceId, idMf, idMfValide]);
  // Seuls les doublons lus pour l'identifiant en cours comptent (état dérivé : rien à remettre à zéro).
  const avertissementsLocaux = idMfValide && doublons.idMf === idMf ? doublons.noms.map((nom) => `Ce matricule fiscal est déjà porté par le dossier « ${nom} »`) : [];

  const next = () => {
    setError(null);
    if (step === 0) {
      if (!raison) { setError(`${formeIndividuelle(identite.formeJuridique) ? 'Le nom du titulaire' : 'La raison sociale'} est obligatoire.`); return; }
      if (!mf.ok) { setError(mf.erreur || 'Matricule fiscal invalide.'); return; }
      if (!regimeTouche) setRegime((r) => ({ ...r, ...regimeParForme(identite.formeJuridique) }));
    }
    if (step === 2 && erreurExercice) { setError(erreurExercice); return; }
    setStep((s) => s + 1);
  };

  const creer = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post(`/api/compta/espaces/${espaceId}/dossiers`, { identite: corpsIdentite(identite), regime, exercice });
      const fiche = data as FicheDossier;
      // Les avertissements du serveur qui n'ont pas déjà été montrés dans l'assistant (matricule sans clé, par exemple).
      const restants = (fiche.avertissements || []).filter((a) => !avertissementsLocaux.includes(a));
      if (restants.length) {
        await alerte({ title: 'Dossier créé', message: restants.join('\n'), tone: 'info', icon: '⚠️' });
      }
      onClose();
      navigate(`/dossiers/${fiche.id}`);
    } catch (err) {
      setError(messageDossier(err, 'Le dossier n\'a pas pu être créé — réessayez.', role));
      setSaving(false);
    }
  };

  const n = nbPeriodes(exercice);
  return (
    <div ref={cadre} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Nouveau dossier"
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, outline: 'none' }}
      onKeyDown={(e) => { if (e.key === 'Escape' && !saving) onClose(); }}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 640, maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.22)' }}>
        <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Nouveau dossier</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Étape {step + 1} sur {STEPS.length} — {STEPS[step]}</div>
            </div>
            <button type="button" onClick={onClose} disabled={saving} aria-label="Fermer" style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#f1f5f9', color: '#64748b', fontSize: 18, cursor: saving ? 'default' : 'pointer' }}>✕</button>
          </div>
          <StepIndicator current={step} />
        </div>

        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {/* Étape 1 gardée montée : le compte rendu de la lecture de la patente reste là au retour. */}
          <div style={{ display: step === 0 ? 'flex' : 'none', flexDirection: 'column', gap: 16 }}>
            <div style={sectionTitre}>🪪 Identité légale de l'entreprise <span style={sectionAide}>telle qu'écrite sur la patente ; seule la raison sociale est obligatoire</span></div>
            <ClientIdentiteForm value={identite} onChange={(v) => { setIdentite(v); setError(null); }} disabled={saving} onLecture={setLectureEnCours} />
            {avertissementsLocaux.map((a) => <div key={a} role="status" style={bannerWarn}>⚠️ {a} (ce n'est pas un refus : groupes, franchises)</div>)}
          </div>

          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={sectionTitre}>⚖️ Régime fiscal <span style={sectionAide}>proposé d'après la forme juridique ({libelleForme(identite.formeJuridique) || 'non renseignée'}), à vérifier</span></div>
              <FormulaireRegime valeur={regime} onChange={(r) => { setRegime(r); setRegimeTouche(true); }} disabled={saving} prefixe="nd-regime" />
            </div>
          )}

          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={sectionTitre}>📅 Premier exercice <span style={sectionAide}>ses périodes mensuelles sont créées avec lui</span></div>
              <FormulaireExercice valeur={exercice} onChange={(e) => { setExercice(e); setError(null); }} disabled={saving} prefixe="nd-exercice" />
            </div>
          )}

          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ background: 'linear-gradient(135deg,#f0f9ff 0%,#e0f2fe 100%)', border: '1px solid #bae6fd', borderRadius: 14, padding: '14px 18px' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0c4a6e', marginBottom: 10 }}>📋 Récapitulatif</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>🏢 </span><strong>{identite.nomCommercial || raison}</strong>
                    {identite.nomCommercial ? ` (${raison})` : ''}{identite.formeJuridique ? ` · ${libelleForme(identite.formeJuridique)}` : ''}{identite.matriculeFiscal ? ` · MF ${identite.matriculeFiscal}` : ''}
                  </div>
                  {(identite.adresse || identite.ville) && (
                    <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#64748b', fontWeight: 600 }}>📍 </span>{[identite.adresse, identite.ville].filter(Boolean).join(', ')}</div>
                  )}
                  {identite.representantNom && (
                    <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#64748b', fontWeight: 600 }}>👤 </span>{[identite.representantNom, identite.representantQualite].filter(Boolean).join(' — ')}</div>
                  )}
                  <div><span style={{ color: '#64748b', fontWeight: 600 }}>⚖️ </span>{libellePersonne(regime.personne)} · {libelleImpot(regime.impot)}</div>
                  <div><span style={{ color: '#64748b', fontWeight: 600 }}>🧾 </span>{libelleTva(regime.tva)}</div>
                  <div><span style={{ color: '#64748b', fontWeight: 600 }}>Exportateur total </span>{ouiNon(regime.exportateurTotal)}</div>
                  <div><span style={{ color: '#64748b', fontWeight: 600 }}>Télédéclaration </span>{ouiNon(regime.teledeclaration)}</div>
                  {regime.debutActivite && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#64748b', fontWeight: 600 }}>Début d'activité </span>{fmtDate(regime.debutActivite)}</div>}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <span style={{ color: '#64748b', fontWeight: 600 }}>📅 Exercice </span>du {fmtDate(exercice.debut)} au {fmtDate(exercice.fin)} · {n} période{n > 1 ? 's' : ''} mensuelle{n > 1 ? 's' : ''}
                  </div>
                  {!complete && (
                    <div style={{ ...bannerWarn, gridColumn: '1 / -1', fontWeight: 500 }}>🪪 Identité à compléter : le dossier sera créé, sa fiche restera marquée « Identité à compléter » (raison sociale, matricule fiscal, adresse et ville).</div>
                  )}
                  {avertissementsLocaux.map((a) => <div key={a} style={{ ...bannerWarn, gridColumn: '1 / -1', fontWeight: 500 }}>⚠️ {a}</div>)}
                </div>
              </div>
              <div style={{ background: '#fefce8', border: '1px solid #fde68a', borderRadius: 10, padding: '10px 14px', fontSize: 11, color: '#92400e', lineHeight: 1.7 }}>
                Le plan de comptes, les journaux, les taxes et les tiers du dossier arrivent à la prochaine étape de LabFlow Compta.
              </div>
            </div>
          )}

          {error && <div role="alert" style={{ marginTop: 14, ...bannerDanger }}>{error}</div>}
        </div>

        <div style={{ padding: '16px 28px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <button type="button" onClick={step === 0 ? onClose : () => { setError(null); setStep((s) => s - 1); }} disabled={saving}
            style={{ padding: '9px 22px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {step === 0 ? 'Annuler' : '← Retour'}
          </button>
          {step < 3 ? (
            // Clés distinctes : « Suivant » et « Créer » sont deux boutons, jamais le même nœud (un double clic sur
            // « Suivant » à l'étape Exercice ne doit pas créer le dossier sans passer par le récapitulatif).
            <button key="suivant" type="button" onClick={next} disabled={nextDisabled}
              style={{ padding: '9px 28px', borderRadius: 9, border: 'none', background: nextDisabled ? '#e5e7eb' : 'linear-gradient(135deg,#4338ca,#6366f1)', color: nextDisabled ? '#9ca3af' : '#fff', fontSize: 13, fontWeight: 700, cursor: nextDisabled ? 'default' : 'pointer' }}>
              {step === 0 && lectureEnCours ? 'Lecture en cours…' : 'Suivant →'}
            </button>
          ) : (
            <button key="creer" type="button" onClick={creer} disabled={saving}
              style={{ padding: '9px 28px', borderRadius: 9, border: 'none', background: saving ? '#e5e7eb' : 'linear-gradient(135deg,#059669,#10b981)', color: saving ? '#9ca3af' : '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
              {saving ? 'Création en cours…' : '✓ Créer le dossier'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const sectionTitre: React.CSSProperties = { fontSize: 12.5, fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9', paddingBottom: 6 };
const sectionAide: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#94a3b8' };
const bannerWarn: React.CSSProperties = { background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: '#92400e', fontWeight: 600 };
const bannerDanger: React.CSSProperties = { background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 };
