import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../../api/client';
import BoutonAide from '../BoutonAide';
import ListeDossiers from '../ListeDossiers';
import { allerVers } from '../passage';
import { libelleNiveau, resumeDossiers, type DossiersAcces } from '../comptables';
import { texteEtatAbonnement, type EtatAbonnement } from '../dossiers';
import { ChoixDossiers } from '../ui';
import { bouton, petit } from '../styles';

// « Ma comptabilité » (LabFlow Compta, étape S2c) : la comptabilité d'un client LabFlow qui a le module Comptabilité —
// son module (postes, mois de première facturation), son comptable et ses gérants comptables supplémentaires (S3b :
// désignés dans LabFlow, page Gérants, ouverte par « Gérer sur LabFlow » sans ressaisie) ; sans module, un message
// renvoie vers LabFlow. S4c (réponse 4 du client du 07/10) : le client règle ICI les dossiers de chaque accès comptable
// (« Tous les dossiers » ou une liste à cocher) ; son comptable voit tout par défaut, un gérant comptable
// supplémentaire ne voit rien tant que rien n'est coché. La page Gérants de LabFlow ne change pas.
interface Acces {
  id: number; etat: 'a_attribuer' | 'actif'; obligatoire: boolean; niveau: string;
  nom: string | null; email: string | null; invitationEnAttente: boolean;
  // Absent tant que le serveur d'avant S4c est servi : un accès sans réglage voit tout. S4d : les premiers noms de la
  // liste (trois au plus), pour la ligne « Dossiers ».
  dossiers?: DossiersAcces;
  dossiersNoms?: string[];
}
interface MaComptabilite {
  espace: { id: number; nom: string; etat: string; ouvertLe: string };
  module: {
    actif: boolean; activeLe: string | null; factureAPartirDe: string | null; nbGerants: number;
    postes: { code: string; libelle: string; montant: number }[]; totalMensuel: number;
  } | null;
  comptables: Acces[];
  // S4c : l'état de l'abonnement (D4), qui ferme « Régler » comme « + Dossier » quand la comptabilité n'est pas modifiable.
  etatAbonnement?: EtatAbonnement;
}

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('fr-FR') : '—');
const fmtMois = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '—');
const statutDe = (err: unknown) => (err as { response?: { status?: number } })?.response?.status;
const refusDe = (err: unknown) => (err as { response?: { data?: { message?: string; code?: string } } })?.response?.data;

export default function ComptaMaComptabilite() {
  const [donnees, setDonnees] = useState<MaComptabilite | null>(null);
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'inactif' | 'erreur'>('chargement');
  const [ouverture, setOuverture] = useState(false);
  const [erreurGerer, setErreurGerer] = useState('');
  // S4c : réglage des dossiers d'un accès en cours (identifiant de l'accès), une écriture à la fois ; la confirmation
  // s'affiche sous la ligne de l'accès réglé.
  const [reglage, setReglage] = useState<number | null>(null);
  const [envoiReglage, setEnvoiReglage] = useState(false);
  const [erreurReglage, setErreurReglage] = useState('');
  const [infoReglage, setInfoReglage] = useState<{ id: number; texte: string } | null>(null);
  // Lectures numérotées : une lecture partie avant la dernière réponse reçue ne l'écrase jamais.
  const tour = useRef(0);
  const gerer = async () => {
    if (ouverture) return;
    setOuverture(true);
    setErreurGerer('');
    try {
      await allerVers('app', undefined, '/client/gerants#gerants-comptabilite');
    } catch {
      setErreurGerer('Ouverture impossible pour le moment, réessayez.');
      setOuverture(false);
    }
  };

  const charger = useCallback(() => {
    const moi = ++tour.current;
    api.get('/api/compta/ma-comptabilite')
      .then(({ data }) => { if (moi === tour.current) { setDonnees(data as MaComptabilite); setEtat('pret'); } })
      .catch((err) => {
        if (moi !== tour.current) return;
        // Module désactivé entre-temps : la page le dit ; un autre échec de relecture ne masque pas ce qui est affiché.
        if (statutDe(err) === 404) setEtat('inactif');
        else setEtat((e) => (e === 'pret' ? 'pret' : 'erreur'));
      });
  }, []);
  useEffect(() => { charger(); }, [charger]);

  // S4c : PUT /mes-comptables/:id avec le seul réglage `dossiers` ; la réponse rend les accès et le catalogue à jour.
  const ouvrirReglage = (id: number) => { setErreurReglage(''); setInfoReglage(null); setReglage(id); };
  const fermerReglage = () => { setReglage(null); setErreurReglage(''); };
  const enregistrerDossiers = useCallback(async (id: number, dossiers: DossiersAcces) => {
    if (envoiReglage) return;
    setEnvoiReglage(true);
    setErreurReglage('');
    try {
      const { data } = await api.put(`/api/compta/mes-comptables/${id}`, { dossiers });
      const e = data as { comptables: Acces[] };
      tour.current += 1;
      setDonnees((d) => (d ? { ...d, comptables: e.comptables } : d));
      setReglage(null);
      setInfoReglage({ id, texte: 'Dossiers enregistrés.' });
    } catch (err) {
      const r = refusDe(err);
      // Accès disparu (la personne a quitté) ou dossier coché qui n'existe plus : réglage fermé, page relue.
      if (statutDe(err) === 404 || r?.code === 'DOSSIER_INCONNU') { setReglage(null); charger(); }
      const ferme: EtatAbonnement | null = r?.code === 'READ_ONLY' ? 'lecture_seule' : r?.code === 'BLOCKED' ? 'bloque' : r?.code === 'SUSPENDED' ? 'suspendu' : null;
      setErreurReglage(ferme ? `${texteEtatAbonnement(ferme, 'titulaire')} : les dossiers de vos accès ne se changent pas pour le moment.` : r?.message || 'Enregistrement impossible, réessayez.');
    } finally {
      setEnvoiReglage(false);
    }
  }, [envoiReglage, charger]);

  const comptable = donnees?.comptables.find((c) => c.obligatoire) || null;
  const supplementaires = donnees?.comptables.filter((c) => !c.obligatoire) || [];
  const module = donnees?.module || null;
  // Comptabilité non modifiable (abonnement en attente, bloqué, suspendu) : « Régler » fermé, comme « + Dossier ».
  const reglageFerme = (donnees?.etatAbonnement ?? 'actif') !== 'actif';
  const propsReglage = (c: Acces) => ({
    acces: c, espaceId: donnees?.espace.id ?? 0, ouvert: reglage === c.id, envoi: envoiReglage, erreur: reglage === c.id ? erreurReglage : '',
    info: infoReglage?.id === c.id ? infoReglage.texte : '', ferme: reglageFerme, autreOuvert: reglage !== null && reglage !== c.id,
    onOuvrir: () => ouvrirReglage(c.id), onFermer: fermerReglage, onEnregistrer: (d: DossiersAcces) => enregistrerDossiers(c.id, d),
  });

  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #7c3aed 100%)', borderRadius: 18, padding: '24px 28px',
        marginBottom: 24, boxShadow: '0 8px 32px rgba(67,56,202,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>🧮</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Ma comptabilité</h1>
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>{donnees ? donnees.espace.nom : 'La comptabilité de votre entreprise'}</p>
        </div>
        <BoutonAide section="compta-ma-comptabilite" />
      </div>

      {etat === 'chargement' && <div className="loading-text">Chargement…</div>}
      {etat === 'erreur' && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600 }}>Impossible de charger votre comptabilité. Réessayez plus tard.</div>}
      {etat === 'inactif' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '22px 24px', maxWidth: 640 }}>
          <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: 6 }}>Le module Comptabilité n'est pas activé sur votre compte</div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>
            Lorsqu'il vous est proposé, vous pouvez le demander depuis LabFlow : page <strong>Mon abonnement</strong>, carte
            <strong> Module Comptabilité</strong>, bouton <strong>Demander l'activation</strong>.
          </p>
        </div>
      )}

      {etat === 'pret' && donnees && (
        <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          <Carte titre="📒 Votre module" sousTitre="Facturé avec votre abonnement LabFlow, à plein tarif">
            {(module?.postes || []).map((p) => <Ligne key={p.code} libelle={p.libelle} valeur={`${p.montant.toFixed(2)} DT/mois`} />)}
            <Ligne libelle="Activé le" valeur={fmtDate(module?.activeLe || null)} />
            {(module?.postes.length ?? 0) > 1 && <Ligne libelle="Total mensuel" valeur={`${(module?.totalMensuel ?? 0).toFixed(2)} DT/mois`} />}
            <Ligne libelle="Facturé à partir de" valeur={fmtMois(module?.factureAPartirDe || null)} />
          </Carte>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Carte titre="👤 Votre comptable" sousTitre="Son accès est compris dans le module">
              {comptable && comptable.etat !== 'a_attribuer' ? (
                <>
                  <Ligne libelle="Nom" valeur={comptable.nom || '—'} />
                  <Ligne libelle="Email" valeur={comptable.email || '—'} />
                  <Ligne libelle="Niveau" valeur={libelleNiveau(comptable.niveau)} />
                  <Ligne libelle="État" valeur={comptable.invitationEnAttente ? '⏳ Invitation envoyée' : '● Actif'} />
                  <ReglageDossiers {...propsReglage(comptable)} />
                </>
              ) : (
                <>
                  <span style={{ display: 'inline-block', fontSize: '0.75rem', fontWeight: 800, padding: '3px 10px', borderRadius: 20, background: '#fef3c7', color: '#92400e' }}>À désigner</span>
                  <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                    Indiquez le nom et l'adresse email de votre comptable dans LabFlow, page Gérants : il recevra alors son accès.
                  </p>
                </>
              )}
              <button type="button" onClick={gerer} disabled={ouverture}
                style={{ marginTop: 12, border: 'none', cursor: ouverture ? 'default' : 'pointer', opacity: ouverture ? 0.7 : 1, padding: '9px 16px', borderRadius: 8, background: 'linear-gradient(135deg,#312e81,#4338ca)', color: '#fff', fontSize: '0.82rem', fontWeight: 700 }}>
                {ouverture ? 'Ouverture…' : 'Gérer sur LabFlow →'}
              </button>
              {erreurGerer && <div role="alert" style={{ color: '#dc2626', fontSize: '0.78rem', marginTop: 8 }}>{erreurGerer}</div>}
            </Carte>
            <Carte titre="👥 Gérants comptables supplémentaires" sousTitre="Accès comptables en plus de celui de votre comptable">
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#3730a3' }}>
                {supplementaires.length}<span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}> / {module?.nbGerants ?? 0}</span>
              </div>
              {supplementaires.map((c) => (
                <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid #f8fafc', fontSize: '0.84rem', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', overflowWrap: 'anywhere' }}>{c.nom || '—'}</div>
                  {c.email && <div style={{ color: '#64748b', overflowWrap: 'anywhere' }}>{c.email}</div>}
                  <div style={{ color: '#475569', marginTop: 2 }}>
                    {c.etat === 'a_attribuer' ? 'Accès libéré' : `${libelleNiveau(c.niveau)} · ${c.invitationEnAttente ? '⏳ invitation envoyée' : '● actif'}`}
                  </div>
                  {c.etat !== 'a_attribuer' && <ReglageDossiers {...propsReglage(c)} />}
                </div>
              ))}
              <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#64748b', lineHeight: 1.5 }}>
                {(module?.nbGerants ?? 0) > 0 ? 'Ajoutez-les ou retirez-les dans LabFlow, page Gérants ; leurs dossiers se règlent ici.' : 'Aucun pour l\'instant : vous pouvez en demander dans LabFlow, page Gérants.'}
              </p>
            </Carte>
          </div>
        </div>
        {erreurReglage && reglage === null && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginTop: 14, fontSize: '0.82rem', color: '#dc2626' }}>{erreurReglage}</div>}
        {/* S4b : le dossier « Mon entreprise » (créé d'office) et les autres entités du client, même assistant que les cabinets. */}
        <div style={{ marginTop: 24 }}>
          <ListeDossiers espaceId={donnees.espace.id} titre="📁 Mes dossiers" />
        </div>
        </>
      )}
    </div>
  );
}

function Carte({ titre, sousTitre, children }: { titre: string; sousTitre: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #eef2ff', background: 'linear-gradient(135deg,#f8faff,#eef2ff)' }}>
        <div style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.95rem' }}>{titre}</div>
        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{sousTitre}</div>
      </div>
      <div style={{ padding: '14px 18px' }}>{children}</div>
    </div>
  );
}

function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.86rem', padding: '6px 0', borderBottom: '1px solid #f8fafc' }}>
      <span style={{ color: '#64748b', minWidth: 0, overflowWrap: 'anywhere' }}>{libelle}</span>
      <span style={{ color: '#0f172a', fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{valeur}</span>
    </div>
  );
}

// S4c : la ligne « Dossiers » d'un accès (résumé + « Régler ») et, ouvert, le choix des dossiers avec Enregistrer /
// Annuler. La valeur en cours repart de l'accès à chaque ouverture (une saisie abandonnée n'est pas gardée). Le bouton
// reste en place (le focus ne se perd pas) : il ouvre puis referme. `ferme` : comptabilité non modifiable ; `autreOuvert` :
// un autre accès est en cours de réglage (un seul à la fois, sans perdre sa saisie).
function ReglageDossiers({ acces, espaceId, ouvert, envoi, erreur, info, ferme, autreOuvert, onOuvrir, onFermer, onEnregistrer }: {
  acces: Acces; espaceId: number; ouvert: boolean; envoi: boolean; erreur: string; info: string; ferme: boolean; autreOuvert: boolean;
  onOuvrir: () => void; onFermer: () => void; onEnregistrer: (dossiers: DossiersAcces) => void;
}) {
  const [valeur, setValeur] = useState<DossiersAcces>(acces.dossiers ?? 'tous');
  const resume = resumeDossiers(acces.dossiers, acces.dossiersNoms);
  const qui = acces.nom || acces.email || 'cet accès';
  const inactif = ferme || autreOuvert;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: '0.86rem', padding: '6px 0', borderBottom: '1px solid #f8fafc', flexWrap: 'wrap' }}>
        <span style={{ color: '#64748b' }}>Dossiers</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0 }}>
          <span style={{ color: resume.vide ? '#92400e' : '#0f172a', fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{resume.texte}</span>
          <button type="button" onClick={() => { if (ouvert) onFermer(); else { setValeur(acces.dossiers ?? 'tous'); onOuvrir(); } }} disabled={envoi || inactif} aria-expanded={ouvert}
            aria-label={ouvert ? `Fermer le réglage des dossiers de ${qui}` : `Régler les dossiers de ${qui}`} title={ferme ? 'Comptabilité non modifiable' : autreOuvert ? 'Terminez d\'abord le réglage en cours' : undefined}
            style={{ ...petit('#eef2ff', '#4338ca', '#c7d2fe'), ...(inactif ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}>
            {ouvert ? '✕ Fermer' : '📁 Régler'}
          </button>
        </span>
      </div>
      {info && <div role="status" style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 600, padding: '6px 0' }}>✓ {info}</div>}
      {ouvert && (
        <div style={{ marginTop: 10 }}>
          <ChoixDossiers id={`mc-dossiers-${acces.id}`} libelle="Réglage" valeur={valeur} onChange={setValeur} espaceId={espaceId} />
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '9px 13px', fontSize: '0.82rem', color: '#dc2626', marginBottom: 10 }}>{erreur}</div>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => onEnregistrer(valeur)} disabled={envoi} style={{ ...bouton('#4338ca', '#fff', '#4338ca'), flex: '2 1 160px', opacity: envoi ? 0.7 : 1 }}>{envoi ? 'Enregistrement…' : '✓ Enregistrer'}</button>
            <button type="button" onClick={onFermer} disabled={envoi} style={{ ...bouton('#fff', '#374151', '#e2e8f0'), flex: '1 1 100px' }}>Annuler</button>
          </div>
        </div>
      )}
    </>
  );
}
