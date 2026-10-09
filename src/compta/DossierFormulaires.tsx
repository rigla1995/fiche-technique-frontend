import { useEffect, useRef } from 'react';
import { IMPOTS, PERSONNES, TVAS, controlerExercice, finDeMois, nbPeriodes, type Exercice, type Regime } from './dossiers';
import { inp, lbl } from './styles';

// LabFlow Compta, étape S4a : formulaires du régime fiscal et de l'exercice, partagés par l'assistant « Nouveau dossier »
// et la fiche du dossier (modification), et la fenêtre qui les porte. Composants contrôlés ({ valeur, onChange }) ; le
// serveur revérifie tout.

// Fenêtre d'une modification (fiche du dossier) : même présentation que les assistants de LabFlow ; sous la boîte de
// confirmation (700). `onSubmit` : enregistrement (formulaire, sans validation native : les contrôles sont ceux des
// formulaires) ; Échap ou ✕ ferment (pas pendant l'envoi) ; `inactif` : enregistrement fermé sans changer le libellé
// (lecture de la patente en cours). Le cadre reçoit le clavier à l'ouverture : Échap marche sans cliquer dedans.
// S6a : `largeur` (pixels) pour une fenêtre plus large que `large` (grille des lignes d'une écriture).
export function Modale({ titre, sousTitre, onClose, onSubmit, envoi, erreur, libelleEnvoi = '✓ Enregistrer', libelleAttente = 'Enregistrement…', children, large = false, inactif = false, largeur }: {
  titre: string; sousTitre?: string; onClose: () => void; onSubmit: () => void; envoi: boolean; erreur: string | null; libelleEnvoi?: string;
  // S7a : le libellé du bouton pendant l'envoi (« Préparation du PDF… » quand rien ne s'enregistre).
  libelleAttente?: string;
  children: React.ReactNode; large?: boolean; inactif?: boolean; largeur?: number;
}) {
  const cadre = useRef<HTMLDivElement>(null);
  useEffect(() => { cadre.current?.focus(); }, []);
  // S6a : un refus rendu sous une longue saisie (grille des lignes d'une écriture) se fait voir : défilement jusqu'au message.
  const refErreur = useRef<HTMLDivElement>(null);
  useEffect(() => { if (erreur) refErreur.current?.scrollIntoView({ block: 'nearest' }); }, [erreur]);
  return (
    <div ref={cadre} tabIndex={-1} role="dialog" aria-modal="true" aria-label={titre}
      style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, outline: 'none' }}
      onKeyDown={(e) => { if (e.key === 'Escape' && !envoi) onClose(); }}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); if (!envoi && !inactif) onSubmit(); }}
        style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: largeur ?? (large ? 640 : 560), maxHeight: '92vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(0,0,0,0.22)' }}>
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>{titre}</div>
            {sousTitre && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{sousTitre}</div>}
          </div>
          <button type="button" onClick={onClose} disabled={envoi} aria-label="Fermer" style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: '#f1f5f9', color: '#64748b', fontSize: 18, cursor: envoi ? 'default' : 'pointer', flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {children}
          {erreur && <div ref={refErreur} role="alert" style={{ marginTop: 14, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: '#dc2626', fontWeight: 600 }}>{erreur}</div>}
        </div>
        <div style={{ padding: '14px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose} disabled={envoi} style={{ padding: '9px 22px', borderRadius: 9, border: '1px solid #e2e8f0', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button type="submit" disabled={envoi || inactif} style={{ padding: '9px 28px', borderRadius: 9, border: 'none', background: envoi || inactif ? '#e5e7eb' : 'linear-gradient(135deg,#4338ca,#6366f1)', color: envoi || inactif ? '#9ca3af' : '#fff', fontSize: 13, fontWeight: 700, cursor: envoi || inactif ? 'default' : 'pointer' }}>
            {envoi ? libelleAttente : libelleEnvoi}
          </button>
        </div>
      </form>
    </div>
  );
}

function Choix<T extends string>({ id, titre, options, valeur, onChange, disabled }: {
  id: string; titre: string; options: { valeur: T; libelle: string; aide: string }[]; valeur: T; onChange: (v: T) => void; disabled?: boolean;
}) {
  return (
    <div>
      <div id={id} style={lbl}>{titre}</div>
      <div role="radiogroup" aria-labelledby={id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {options.map((o) => {
          const actif = valeur === o.valeur;
          return (
            <button key={o.valeur} type="button" role="radio" aria-checked={actif} disabled={disabled} onClick={() => onChange(o.valeur)}
              style={{ flex: '1 1 160px', textAlign: 'left', padding: '9px 12px', borderRadius: 10, cursor: disabled ? 'default' : 'pointer', border: `1.5px solid ${actif ? '#4338ca' : '#e2e8f0'}`, background: actif ? '#eef2ff' : '#fff', opacity: disabled ? 0.6 : 1 }}>
              <div style={{ fontWeight: 800, fontSize: '0.82rem', color: actif ? '#3730a3' : '#374151' }}>{actif ? '✓ ' : ''}{o.libelle}</div>
              <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>{o.aide}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FormulaireRegime({ valeur, onChange, disabled, prefixe = 'regime' }: { valeur: Regime; onChange: (r: Regime) => void; disabled?: boolean; prefixe?: string }) {
  const poser = (partie: Partial<Regime>) => onChange({ ...valeur, ...partie });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Choix id={`${prefixe}-personne`} titre="Personne" options={PERSONNES} valeur={valeur.personne} onChange={(personne) => poser({ personne })} disabled={disabled} />
      <Choix id={`${prefixe}-impot`} titre="Impôt sur le bénéfice" options={IMPOTS} valeur={valeur.impot} onChange={(impot) => poser({ impot })} disabled={disabled} />
      <Choix id={`${prefixe}-tva`} titre="TVA" options={TVAS} valeur={valeur.tva} onChange={(tva) => poser({ tva })} disabled={disabled} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={valeur.exportateurTotal} disabled={disabled} onChange={(e) => poser({ exportateurTotal: e.target.checked })} />
          Exportateur total
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.84rem', color: '#374151', cursor: 'pointer' }}>
          <input type="checkbox" checked={valeur.teledeclaration} disabled={disabled} onChange={(e) => poser({ teledeclaration: e.target.checked })} />
          Télédéclaration
        </label>
      </div>
      <div style={{ maxWidth: 260 }}>
        <label htmlFor={`${prefixe}-debut-activite`} style={lbl}>Début d'activité</label>
        <input id={`${prefixe}-debut-activite`} type="date" value={valeur.debutActivite || ''} disabled={disabled} onChange={(e) => poser({ debutActivite: e.target.value || null })} style={inp} />
        <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 4 }}>Facultatif : la date de la patente.</div>
      </div>
      <div style={{ fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
        Ces choix serviront aux taxes et aux déclarations ; rien n'est calculé à cette étape. Ils restent modifiables dans la fiche du dossier.
      </div>
    </div>
  );
}

export function FormulaireExercice({ valeur, onChange, disabled, prefixe = 'exercice', premier = true }: { valeur: Exercice; onChange: (e: Exercice) => void; disabled?: boolean; prefixe?: string; premier?: boolean }) {
  const erreur = controlerExercice(valeur);
  const n = nbPeriodes(valeur);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 12 }}>
        <div>
          <label htmlFor={`${prefixe}-debut`} style={lbl}>Début *</label>
          <input id={`${prefixe}-debut`} type="date" value={valeur.debut} disabled={disabled} onChange={(e) => onChange({ ...valeur, debut: e.target.value })} style={inp} />
        </div>
        <div>
          <label htmlFor={`${prefixe}-fin`} style={lbl}>Fin *</label>
          <input id={`${prefixe}-fin`} type="date" value={valeur.fin} disabled={disabled} onChange={(e) => onChange({ ...valeur, fin: e.target.value })} style={inp} />
          {valeur.fin && /^\d{4}-\d{2}-\d{2}$/.test(valeur.fin) && valeur.fin !== finDeMois(valeur.fin) && (
            <button type="button" disabled={disabled} onClick={() => onChange({ ...valeur, fin: finDeMois(valeur.fin) })}
              style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, color: '#4338ca', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
              Mettre au {finDeMois(valeur.fin).slice(8)} du mois
            </button>
          )}
        </div>
      </div>
      {erreur
        ? <div role="alert" style={{ fontSize: '0.78rem', color: '#b45309', fontWeight: 600 }}>{erreur}</div>
        : <div style={{ fontSize: '0.78rem', color: '#166534', fontWeight: 600 }}>✓ {n} période{n > 1 ? 's' : ''} mensuelle{n > 1 ? 's' : ''}, toutes ouvertes.</div>}
      <div style={{ fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
        {premier
          ? 'L\'année civile en cours est proposée. Un exercice couvre douze mois au plus et finit le dernier jour d\'un mois ; un premier exercice peut être plus court (début d\'activité en cours d\'année).'
          : 'Les dates changent tant qu\'aucune écriture n\'est enregistrée ; les périodes mensuelles sont refaites.'}
      </div>
    </div>
  );
}
