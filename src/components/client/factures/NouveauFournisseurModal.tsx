// Factures fournisseur, étape F2 : fournisseur inconnu lu sur une facture → fiche pré-remplie d'après la facture, que le
// client (ou le gérant) relit et valide (réponse 7 : « il faut le créer mais le client / gérant valide »). Le nouveau
// fournisseur est rattaché au lieu de la saisie (activité ou labo). Si c'est en fait un fournisseur déjà enregistré
// (sous un autre nom), on le choisit dans la liste : le matricule lu lui est ajouté.
import { useEffect, useRef, useState } from 'react';
import api from '../../../api/client';
import { useVocabulaire } from '../../../hooks/useVocabulaire';
import { controlerMatriculeFiscal } from '../../admin/matriculeFiscal';
import { messageErreur } from './pieces';
import type { FournisseurConnu } from './lecture/rapprocher';

export interface FicheProposee {
  nom: string;
  raisonSociale: string;
  matriculeFiscal: string;
  adresse: string;
  telephone: string;
  email: string;
}

interface Props {
  initiale: FicheProposee;
  cible: { type: 'activite' | 'labo'; id: number };
  fournisseursDuCompte: FournisseurConnu[];
  onFermer: () => void;
  /** Fournisseur créé : son identifiant, son nom et son matricule (tels qu'enregistrés). */
  onCree: (id: number, nom: string, matricule: string | null) => void | Promise<void>;
  /** C'est un fournisseur déjà enregistré : le matricule et la raison sociale de la fenêtre (corrigés s'il y a lieu). */
  onExistant: (f: FournisseurConnu, saisie: { matriculeFiscal: string; raisonSociale: string }) => void;
  erreurCode: (e: unknown) => string | null;
}

const lbl: React.CSSProperties = { fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 3 };

export default function NouveauFournisseurModal({ initiale, cible, fournisseursDuCompte, onFermer, onCree, onExistant, erreurCode }: Props) {
  const voc = useVocabulaire();
  const [f, setF] = useState<FicheProposee>(initiale);
  // Ville d'après l'adresse lue (« …, 8000 Nabeul » → Nabeul), à relire comme le reste.
  const [ville, setVille] = useState(() => initiale.adresse.match(/\b\d{4}\s+([A-Za-zÀ-ÿ' -]{2,40})$/)?.[1]?.trim() ?? '');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [existant, setExistant] = useState<FournisseurConnu | null>(null);
  const [choixId, setChoixId] = useState('');

  useEffect(() => {
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape' && !enCours) onFermer(); };
    window.addEventListener('keydown', echap);
    return () => window.removeEventListener('keydown', echap);
  }, [enCours, onFermer]);
  // Focus : sur le nom à l'ouverture, rendu au bouton d'origine à la fermeture.
  const nomRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const avant = document.activeElement as HTMLElement | null;
    nomRef.current?.focus();
    return () => { avant?.focus?.(); };
  }, []);
  const saisie = () => ({ matriculeFiscal: mf.ok ? mf.valeur : '', raisonSociale: f.raisonSociale.trim() });

  const mf = controlerMatriculeFiscal(f.matriculeFiscal);
  const champ = (cle: keyof FicheProposee) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [cle]: e.target.value }));

  const creer = async () => {
    if (!f.nom.trim()) { setErreur('Le nom est requis.'); return; }
    if (!mf.ok) { setErreur(mf.erreur ?? 'Matricule fiscal invalide.'); return; }
    setEnCours(true);
    setErreur(null);
    setExistant(null);
    try {
      const { data } = await api.post('/api/entreprise/fournisseurs', {
        nom: f.nom.trim(), raisonSociale: f.raisonSociale.trim() || null, matriculeFiscal: f.matriculeFiscal.trim() || null,
        adresse: f.adresse.trim() || null, telephone: f.telephone.trim() || null, email: f.email.trim() || null, ville: ville.trim() || null,
        ...(cible.type === 'activite' ? { activiteIds: [cible.id] } : { laboIds: [cible.id] }),
      });
      window.dispatchEvent(new Event('fournisseur-created'));
      await onCree((data as { id: number }).id, f.nom.trim(), (data as { matriculeFiscal?: string | null }).matriculeFiscal ?? null);
    } catch (e) {
      // Matricule déjà porté par un fournisseur du compte (peut-être hors de la vue d'un gérant) : on propose de le prendre.
      const autre = (e as { response?: { data?: { fournisseur?: { id: number; nom: string } } } }).response?.data?.fournisseur;
      if (erreurCode(e) === 'MATRICULE_EXISTANT' && autre) setExistant({ id: autre.id, nom: autre.nom, matriculeFiscal: mf.valeur || null });
      setErreur(messageErreur(e, "La création n'a pas abouti."));
    } finally {
      setEnCours(false);
    }
  };

  // Ceux qui n'ont pas encore de matricule d'abord (les fiches d'avant la lecture des factures).
  const candidats = [...fournisseursDuCompte].sort((a, b) => Number(Boolean(a.matriculeFiscal)) - Number(Boolean(b.matriculeFiscal)) || a.nom.localeCompare(b.nom));

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="titre-nouveau-fournisseur" style={{ maxWidth: 560, width: '96%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ background: 'linear-gradient(135deg, #7c2d12, #ea580c)', borderRadius: '12px 12px 0 0', padding: '16px 20px' }}>
          <h2 id="titre-nouveau-fournisseur" style={{ color: '#fff', margin: 0, fontSize: '1rem', fontWeight: 800 }}>{voc.Nouveau('fournisseur')} — d'après la facture</h2>
          <button className="modal-close" onClick={onFermer} disabled={enCours} style={{ color: '#fff' }} aria-label="Fermer">✕</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Valeurs lues sur la facture : relisez-les et corrigez-les avant de créer {voc.le('fournisseur')}. La fiche sera rattachée {cible.type === 'activite' ? voc.au('activite') : voc.au('labo')} de cette saisie.
          </p>
          <div><label style={lbl} htmlFor="nf-nom">Nom *</label><input id="nf-nom" ref={nomRef} className="input" style={{ width: '100%' }} value={f.nom} onChange={champ('nom')} maxLength={255} /></div>
          <div><label style={lbl} htmlFor="nf-rs">Raison sociale</label><input id="nf-rs" className="input" style={{ width: '100%' }} value={f.raisonSociale} onChange={champ('raisonSociale')} maxLength={200} /></div>
          <div>
            <label style={lbl} htmlFor="nf-mf">Matricule fiscal</label>
            <input id="nf-mf" className="input" style={{ width: '100%' }} value={f.matriculeFiscal} onChange={champ('matriculeFiscal')} placeholder="1234567A/A/M/000" maxLength={40} />
            {f.matriculeFiscal.trim() && (!mf.ok || mf.avertissement) && <div style={{ fontSize: '0.74rem', marginTop: 3, color: mf.ok ? '#b45309' : 'var(--danger)' }}>{mf.ok ? mf.avertissement : mf.erreur}</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div><label style={lbl} htmlFor="nf-adr">Adresse</label><input id="nf-adr" className="input" style={{ width: '100%' }} value={f.adresse} onChange={champ('adresse')} maxLength={500} /></div>
            <div><label style={lbl} htmlFor="nf-ville">Ville</label><input id="nf-ville" className="input" style={{ width: '100%' }} value={ville} onChange={(e) => setVille(e.target.value)} maxLength={100} /></div>
            <div><label style={lbl} htmlFor="nf-tel">Téléphone</label><input id="nf-tel" className="input" style={{ width: '100%' }} value={f.telephone} onChange={champ('telephone')} maxLength={50} /></div>
            <div><label style={lbl} htmlFor="nf-mail">Email</label><input id="nf-mail" className="input" style={{ width: '100%' }} value={f.email} onChange={champ('email')} maxLength={200} /></div>
          </div>
          {erreur && (
            <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '7px 10px', fontSize: '0.8rem' }}>
              {erreur}
              {existant && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 8, fontWeight: 700 }} onClick={() => onExistant(existant, saisie())}>
                  Prendre « {existant.nom} »
                </button>
              )}
            </div>
          )}
          {candidats.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <label style={lbl} htmlFor="nf-existant">Ou bien c'est {voc.un('fournisseur')} déjà {voc.acc('fournisseur', 'enregistré', 'enregistrée')}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <select id="nf-existant" className="input" style={{ flex: 1, minWidth: 180 }} value={choixId} onChange={(e) => setChoixId(e.target.value)}>
                  <option value="">— Choisir —</option>
                  {candidats.map((c) => <option key={c.id} value={String(c.id)}>{c.nom}{c.matriculeFiscal ? ` (MF ${c.matriculeFiscal})` : ''}</option>)}
                </select>
                <button type="button" className="btn btn-ghost btn-sm" disabled={!choixId || enCours}
                  onClick={() => { const c = candidats.find((x) => String(x.id) === choixId); if (c) onExistant(c, saisie()); }}>
                  C'est {voc.acc('fournisseur', 'lui', 'elle')}
                </button>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>
                Le matricule ci-dessus est ajouté à sa fiche quand elle n'en a pas : la prochaine facture sera reconnue d'office.
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-ghost" onClick={onFermer} disabled={enCours}>Annuler</button>
          <button onClick={creer} disabled={enCours}
            style={{ background: 'linear-gradient(135deg, #ea580c, #f97316)', borderRadius: 10, border: 'none', color: '#fff', fontWeight: 800, padding: '9px 20px', cursor: enCours ? 'not-allowed' : 'pointer', opacity: enCours ? 0.7 : 1 }}>
            {enCours ? '…' : `Créer ${voc.le('fournisseur')}`}
          </button>
        </div>
      </div>
    </div>
  );
}
