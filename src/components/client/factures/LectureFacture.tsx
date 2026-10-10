// Factures fournisseur, étape F2 (labflow-reprise/achats-compta/PLAN-FACTURES.md) : lecture de l'en-tête de la facture
// déposée à la saisie d'une appro, et reconnaissance du fournisseur.
// La lecture part seule dès qu'un fichier est déposé (lecture/lireFacture.ts : dans ce navigateur, sans service
// extérieur). Elle REMPLIT les champs vides du bloc (fournisseur reconnu par son matricule, numéro, date) — ou ceux
// qu'une lecture précédente avait remplis — et MONTRE le reste (totaux, timbre, avertissements) ; elle n'écrit jamais
// rien en base sans un clic : rattacher un fournisseur existant à ce lieu, lui ajouter le matricule lu (affiché sur le
// bouton), ou créer un nouveau fournisseur d'après la facture (fenêtre pré-remplie, à valider). Rien ne s'enregistre
// sans « Enregistrer » (réponse 10 du client) ; pendant la lecture, le parent garde « Enregistrer » fermé (onLecture).
import { useEffect, useRef, useState } from 'react';
import api from '../../../api/client';
import { useVocabulaire } from '../../../hooks/useVocabulaire';
import { estErreurDeChunk } from '../../../utils/chunkReload';
import { messageErreur, codeErreur, type FichierChoisi, type LectureEnvoyee } from './pieces';
import { rapprocher, type FournisseurConnu, type Rapprochement } from './lecture/rapprocher';
import type { Destinataire, EnteteLu } from './lecture/types';
import NouveauFournisseurModal, { type FicheProposee } from './NouveauFournisseurModal';

interface FournisseurDuCompte extends FournisseurConnu {
  activiteIds?: number[];
  laboIds?: number[];
  isLabo?: boolean;
}

/** Ce que la lecture remet au bloc de saisie. */
export interface ResultatLecture {
  timbre: number | null;
  totaux: EnteteLu['totaux'];
  lecture: LectureEnvoyee;
}

/** Champs du bloc remplis par une lecture et pas encore retouchés (pastille « lu »). */
export interface ChampsLus { fournisseur?: boolean; ref?: boolean; date?: boolean }

interface Props {
  fichiers: FichierChoisi[];
  /** Copie d'une photo HEIC en cours : la lecture attend. */
  enPreparation: boolean;
  cible: { type: 'activite' | 'labo'; id: number };
  /** Fournisseurs proposés dans la liste du bloc (ceux de ce lieu). */
  fournisseursDuLieu: { id: number; nom: string }[];
  fournisseurId: string;
  refFacture: string;
  /** La date a-t-elle été choisie à la main ? (sinon la date lue la remplace) */
  dateChoisie: boolean;
  /** Champs encore « lus » : une nouvelle lecture les traite comme vides (ils ne viennent pas de la personne). */
  champsLus: ChampsLus;
  dateMin: string;
  dateMax: string;
  accent: string;
  disabled?: boolean;
  /** Remplit des champs du bloc (marqués « lu » par le parent) ; une valeur vide efface un champ lu auparavant. */
  onRemplir: (champs: { fournisseurId?: string; refFacture?: string; date?: string }) => void;
  /** Recharge la liste des fournisseurs du lieu (après un rattachement ou une création). */
  onFournisseursModifies: () => Promise<void>;
  onResultat: (r: ResultatLecture | null) => void;
  /** Début (true) et fin (false) d'une lecture : le parent garde « Enregistrer » fermé entre les deux. */
  onLecture?: (enCours: boolean) => void;
}

const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toFixed(3).replace('.', ','));
const fmtDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const sansEspaces = (s: string) => s.toUpperCase().replace(/\s+/g, '');
/** Durée maximale d'une lecture vue de l'écran (chargement, réseau, reconnaissance) : au-delà, « Enregistrer » se rouvre. */
const DELAI_ECRAN = 150_000;
const API_DELAI = { timeout: 15_000 };
const INVISIBLE: React.CSSProperties = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' };

const encart = (fond: string, bord: string, texte: string): React.CSSProperties => ({
  background: fond, border: `1px solid ${bord}`, color: texte, borderRadius: 8, padding: '7px 10px', fontSize: '0.78rem', lineHeight: 1.45,
});
const petitBouton: React.CSSProperties = {
  padding: '3px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
};

/** Pastille « lu » posée à côté du libellé d'un champ rempli par la lecture (retirée dès qu'on le modifie). */
export function PastilleLue({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <span title="Valeur lue sur la facture : relisez-la" style={{ marginLeft: 6, padding: '0 6px', borderRadius: 10, fontSize: '0.58rem', fontWeight: 800, letterSpacing: 0, textTransform: 'none', background: '#fef3c7', color: '#92400e' }}>
      lu — à relire
    </span>
  );
}

export default function LectureFacture({
  fichiers, enPreparation, cible, fournisseursDuLieu, fournisseurId, refFacture, dateChoisie, champsLus, dateMin, dateMax, accent, disabled,
  onRemplir, onFournisseursModifies, onResultat, onLecture,
}: Props) {
  const voc = useVocabulaire();
  const [etape, setEtape] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [lu, setLu] = useState<(EnteteLu & { duree: number }) | null>(null);
  const [rapp, setRapp] = useState<Rapprochement | null>(null);
  const [compte, setCompte] = useState<FournisseurDuCompte[]>([]);
  const [action, setAction] = useState<string | null>(null);
  const [actionErreur, setActionErreur] = useState<string | null>(null);
  const [modal, setModal] = useState<FicheProposee | null>(null);
  const [refuse, setRefuse] = useState(false);
  // Le matricule de l'entreprise du compte est-il connu ? Sans lui, un matricule lu peut être le sien : on ne l'ajoute
  // jamais à une fiche de fournisseur (il est seulement montré).
  const [clientConnu, setClientConnu] = useState(false);
  // Fichier auquel l'état affiché appartient : un état d'un autre fichier (retiré, remplacé) n'est jamais montré.
  const [cleLue, setCleLue] = useState<string | null>(null);
  const client = useRef<Destinataire | null>(null);
  const generation = useRef(0);
  const dernierLu = useRef<string | null>(null);
  const arret = useRef<AbortController | null>(null);
  // Valeurs du bloc au moment où la lecture se termine (une saisie faite pendant la lecture est gardée).
  const courant = useRef({ fournisseurId, refFacture, dateChoisie, champsLus, fournisseursDuLieu, onRemplir, onResultat, onLecture });
  useEffect(() => { courant.current = { fournisseurId, refFacture, dateChoisie, champsLus, fournisseursDuLieu, onRemplir, onResultat, onLecture }; });
  const montee = useRef(true);
  useEffect(() => {
    montee.current = true;
    return () => {
      montee.current = false;
      generation.current += 1;
      arret.current?.abort();
      courant.current.onLecture?.(false);
    };
  }, []);

  const premier = fichiers[0]?.cle ?? null;
  const dansLeLieu = (f: FournisseurDuCompte) => (cible.type === 'activite' ? (f.activiteIds ?? []).includes(cible.id) : (f.laboIds ?? []).includes(cible.id));

  const resumer = (e: EnteteLu & { duree: number }, r: Rapprochement | null, etat?: LectureEnvoyee['fournisseur']): ResultatLecture => ({
    timbre: e.totaux.timbre,
    totaux: e.totaux,
    lecture: {
      source: e.source, matricule: e.matricule?.valeur ?? null, nom: e.nom?.valeur ?? null, numero: e.numero?.valeur ?? null,
      date: e.date?.valeur ?? null, duree: e.duree, fournisseur: etat ?? r?.etat ?? null,
      totaux: { ht: e.totaux.ht, tva: e.totaux.tva, timbre: e.totaux.timbre, ttc: e.totaux.ttc, fodec: e.totaux.fodec, remise: e.totaux.remise },
    },
  });

  // Une lecture par premier fichier déposé. Tout changement du premier fichier (retiré, remplacé, même pendant la copie
  // d'une photo HEIC) invalide et arrête la lecture en cours ; plus de fichier → plus de lecture.
  useEffect(() => {
    if (premier !== dernierLu.current) {
      generation.current += 1;
      arret.current?.abort();
      arret.current = null;
      const c = courant.current;
      c.onResultat(null);
      c.onLecture?.(false);
      // Les champs remplis par la lecture de l'ancien fichier ne valent plus : ils sont vidés (une saisie à la main reste).
      const vider: { fournisseurId?: string; refFacture?: string; date?: string } = {};
      if (c.champsLus.ref) vider.refFacture = '';
      if (c.champsLus.fournisseur) vider.fournisseurId = '';
      if (c.champsLus.date) vider.date = '';
      if (Object.keys(vider).length) c.onRemplir(vider);
    }
    if (!premier) { dernierLu.current = null; return; }
    if (enPreparation || premier === dernierLu.current) return;
    dernierLu.current = premier;
    const g = generation.current;
    const vivant = () => montee.current && g === generation.current;
    const controle = new AbortController();
    arret.current = controle;
    courant.current.onLecture?.(true);
    void (async () => {
      setCleLue(premier);
      setLu(null); setRapp(null); setErreur(null); setRefuse(false); setActionErreur(null);
      setEtape('Chargement du lecteur…');
      // Garde de l'écran : une lecture bloquée (réseau, rendu d'un PDF) ne garde pas « Enregistrer » fermé.
      const delai = setTimeout(() => {
        if (!vivant()) return;
        generation.current += 1;
        controle.abort();
        setEtape(null);
        setErreur("La lecture prend trop de temps : la facture sera quand même jointe ; saisissez l'en-tête à la main.");
        courant.current.onLecture?.(false);
      }, DELAI_ECRAN);
      try {
        if (!client.current) {
          // Gardé seulement en cas de réussite : un échec passager est retenté à la lecture suivante.
          try {
            const { data } = await api.get('/api/entreprise', API_DELAI);
            const id = data as { nom?: string; identite?: { matriculeFiscal?: string | null; raisonSociale?: string | null; nomCommercial?: string | null } } | null;
            client.current = { matricule: id?.identite?.matriculeFiscal ?? null, noms: [id?.identite?.raisonSociale, id?.identite?.nomCommercial, id?.nom] };
          } catch { /* lecture sans le destinataire : aucun matricule ne sera ajouté à une fiche */ }
        }
        const destinataire = client.current ?? {};
        if (vivant()) setClientConnu(Boolean(destinataire.matricule));
        const { lireFacture } = await import('./lecture/lireFacture');
        const e = await lireFacture(fichiers.map((f) => ({ fichier: f.fichier, type: f.type, apercu: f.apercu })), destinataire, (etapeLue, a) => {
          if (vivant()) setEtape(a === undefined ? etapeLue : `${etapeLue} ${Math.round(a * 100)} %`);
        }, controle.signal);
        if (!vivant()) return;
        const liste = ((await api.get('/api/entreprise/fournisseurs', API_DELAI).catch(() => ({ data: [] }))).data as FournisseurDuCompte[]).filter((f) => !f.isLabo);
        if (!vivant()) return;
        const r = rapprocher({ matricule: e.matricule?.valeur, nom: e.nom?.valeur }, liste);
        setCompte(liste);
        setLu(e);
        setRapp(r);
        // Champs vides du bloc — ou remplis par une lecture précédente — : remplis et marqués « lu ». Un champ saisi
        // à la main n'est jamais écrasé ; un champ lu sur l'ancien fichier, sans valeur sûre sur le nouveau, est vidé.
        const c = courant.current;
        const champs: { fournisseurId?: string; refFacture?: string; date?: string } = {};
        const fournisseurLibre = !c.fournisseurId || Boolean(c.champsLus.fournisseur);
        const refLibre = !c.refFacture.trim() || Boolean(c.champsLus.ref);
        if (fournisseurLibre) {
          if (r.etat === 'reconnu' && c.fournisseursDuLieu.some((f) => f.id === r.fournisseur.id)) champs.fournisseurId = String(r.fournisseur.id);
          else if (c.champsLus.fournisseur) champs.fournisseurId = '';
        }
        // Un numéro peut-être incomplet (« FV-2026- ») est montré, jamais recopié.
        if (refLibre) {
          if (e.numero && !e.numero.note) champs.refFacture = e.numero.valeur.slice(0, 100);
          else if (c.champsLus.ref) champs.refFacture = '';
        }
        if (e.date && !c.dateChoisie && e.date.valeur >= dateMin && e.date.valeur <= dateMax) champs.date = e.date.valeur;
        if (Object.keys(champs).length) c.onRemplir(champs);
        c.onResultat(resumer(e, r));
      } catch (err) {
        if (!vivant()) return;
        const refus = err instanceof Error && err.name === 'LectureImpossible';
        if (!refus) console.warn('[facture] lecture en échec', err instanceof Error ? err.name : '');
        setErreur(refus ? (err as Error).message
          : estErreurDeChunk(err) ? 'LabFlow a été mis à jour : rechargez la page pour lire les factures, ou saisissez à la main.'
            : "La lecture n'a pas abouti : la facture sera quand même jointe ; saisissez l'en-tête à la main.");
      } finally {
        clearTimeout(delai);
        if (vivant()) {
          setEtape(null);
          courant.current.onLecture?.(false);
        }
      }
    })();
  // La lecture ne dépend que du premier fichier (et attend la fin de la préparation d'une photo HEIC).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premier, enPreparation]);

  // Panneau du fichier courant seulement ; la zone annoncée aux lecteurs d'écran, elle, reste en place.
  const visible = Boolean(premier) && cleLue === premier;

  /**
   * Choisir un fournisseur du compte : rattaché à ce lieu s'il ne l'est pas ; `matricule` (lu, ou corrigé dans la fenêtre)
   * ajouté à sa fiche s'il n'en a pas, avec `raisonSociale`. Rien n'est écrit si le fichier change entre-temps.
   */
  const choisir = async (f: FournisseurDuCompte, matricule: string | null, raisonSociale: string | null, etat: LectureEnvoyee['fournisseur']) => {
    if (!lu) return;
    const g = generation.current;
    const encoreLa = () => montee.current && g === generation.current;
    setAction('Enregistrement…');
    setActionErreur(null);
    try {
      let ecrit = false;
      if (matricule && !f.matriculeFiscal) {
        await api.patch(`/api/entreprise/fournisseurs/${f.id}/identite`, {
          matriculeFiscal: matricule, ...(!f.raisonSociale && raisonSociale ? { raisonSociale: raisonSociale.slice(0, 200) } : {}),
        });
        ecrit = true;
      }
      if (!encoreLa()) return;
      if (!dansLeLieu(f) && !courant.current.fournisseursDuLieu.some((x) => x.id === f.id)) {
        // Le matricule présenté prouve au serveur (pour un gérant) que la facture vient bien de ce fournisseur.
        await api.post(`/api/entreprise/fournisseurs/${f.id}/lier`, {
          ...(cible.type === 'activite' ? { activiteId: cible.id } : { laboId: cible.id }),
          matriculeFiscal: f.matriculeFiscal || matricule || lu.matricule?.valeur || undefined,
        });
        ecrit = true;
      }
      if (ecrit) await onFournisseursModifies();
      if (!encoreLa()) return;
      courant.current.onRemplir({ fournisseurId: String(f.id) });
      setRapp({ etat: 'reconnu', fournisseur: { ...f, matriculeFiscal: f.matriculeFiscal || matricule || null }, par: 'matricule' });
      courant.current.onResultat(resumer(lu, rapp, etat));
    } catch (e) {
      if (encoreLa()) setActionErreur(messageErreur(e, "L'enregistrement n'a pas abouti."));
    } finally {
      if (montee.current) setAction(null);
    }
  };

  const fiche = (): FicheProposee => ({
    nom: (lu?.nom?.valeur ?? '').slice(0, 255),
    raisonSociale: (lu?.nom?.valeur ?? '').slice(0, 200),
    matriculeFiscal: lu?.matricule?.valeur ?? '',
    adresse: lu?.adresse?.valeur ?? '',
    telephone: lu?.telephone?.valeur ?? '',
    email: lu?.email?.valeur ?? '',
    noteMatricule: lu?.matricule?.note,
  });

  const t = lu?.totaux;
  const choisiNom = fournisseursDuLieu.find((f) => String(f.id) === fournisseurId)?.nom ?? null;
  const reconnu = rapp && rapp.etat !== 'nouveau' ? rapp.fournisseur : null;
  const autreChoisi = Boolean(reconnu && fournisseurId && String(reconnu.id) !== fournisseurId);
  // Matricule lu ajouté à la fiche proposée seulement s'il est sûr : lettre-clé juste, seul lu, client connu (une forme
  // courte, « 1234567A », est sûre si sa clé l'est).
  const matriculeSur = lu?.matricule && !/lettre-clé|autre/.test(lu.matricule.note ?? '') && clientConnu ? lu.matricule.valeur : null;
  const refDiffere = lu?.numero && !lu.numero.note && refFacture.trim() && sansEspaces(refFacture) !== sansEspaces(lu.numero.valeur);

  return (
    <>
      {/* Annonce aux lecteurs d'écran : le début et la fin, pas chaque pourcentage. */}
      <span role="status" style={INVISIBLE}>
        {!visible ? '' : etape ? 'Lecture de la facture en cours' : lu ? 'Facture lue' : erreur ? 'Lecture impossible' : ''}
      </span>
      {visible && (
      <div style={{ marginTop: 10, border: `1px solid ${accent}33`, borderRadius: 10, padding: '10px 12px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: accent }}>🔎 Lu sur la facture</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {etape ?? (lu ? `${lu.source === 'pdf' ? 'texte du PDF' : 'reconnaissance des caractères'} · ${String(lu.duree).replace('.', ',')} s · lu sur cet appareil, rien n'est envoyé ailleurs` : '')}
          </span>
        </div>

        {erreur && <div style={encart('#fff7ed', '#fed7aa', '#9a3412')}>{erreur}</div>}

        {lu && (
          <>
            {/* Fournisseur */}
            <div style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ minWidth: 92 }}>{voc.Nom('fournisseur')} :</strong>
              {rapp?.etat === 'reconnu' && (
                <>
                  <span>✓ <strong>{rapp.fournisseur.nom}</strong>{rapp.fournisseur.matriculeFiscal ? <span style={{ color: 'var(--text-muted)' }}> · MF {rapp.fournisseur.matriculeFiscal}</span> : null}</span>
                  {String(rapp.fournisseur.id) !== fournisseurId && (
                    <button type="button" style={{ ...petitBouton, color: accent }} disabled={disabled || !!action}
                      onClick={() => choisir(compte.find((f) => f.id === rapp.fournisseur.id) ?? rapp.fournisseur, null, null, 'reconnu')}>
                      {fournisseursDuLieu.some((f) => f.id === rapp.fournisseur.id) ? `Choisir ${rapp.fournisseur.nom}` : 'Rattacher ici et choisir'}
                    </button>
                  )}
                </>
              )}
              {rapp?.etat === 'propose' && !refuse && (
                <>
                  <span>
                    <strong>{rapp.fournisseur.nom}</strong> ? <span style={{ color: 'var(--text-muted)' }}>
                      ({rapp.par === 'nom' ? 'nom voisin' : 'même matricule, autre établissement'} — lu : « {lu.nom?.valeur ?? lu.matricule?.valeur} »)
                    </span>
                  </span>
                  <button type="button" style={{ ...petitBouton, color: accent }} disabled={disabled || !!action}
                    onClick={() => choisir(compte.find((f) => f.id === rapp.fournisseur.id) ?? rapp.fournisseur,
                      rapp.ajouterMatricule ? matriculeSur : null, rapp.ajouterMatricule && matriculeSur ? lu.nom?.valeur ?? null : null, 'propose')}>
                    Oui, c'est {voc.acc('fournisseur', 'lui', 'elle')}{rapp.ajouterMatricule && matriculeSur ? ` — ajouter le MF ${matriculeSur} à sa fiche` : ''}
                  </button>
                  <button type="button" style={petitBouton} disabled={disabled || !!action} onClick={() => setRefuse(true)}>Non</button>
                  {rapp.ajouterMatricule && !matriculeSur && (
                    <span style={{ fontSize: '0.72rem', color: '#b45309', flexBasis: '100%', marginLeft: 100 }}>
                      Le matricule lu n'est pas sûr{!clientConnu ? ' (celui de votre entreprise est inconnu : renseignez-le dans votre profil)' : ''} : il ne sera pas ajouté à la fiche.
                    </span>
                  )}
                </>
              )}
              {(rapp?.etat === 'nouveau' || (rapp?.etat === 'propose' && refuse)) && (
                <>
                  <span>
                    {lu.nom ? <>« <strong>{lu.nom.valeur}</strong> »</> : 'non reconnu'}
                    {lu.matricule ? <span style={{ color: 'var(--text-muted)' }}> · MF {lu.matricule.valeur}</span> : null}
                    <span style={{ color: 'var(--text-muted)' }}> — {voc.aucun('fournisseur')} {voc.acc('fournisseur', 'connu', 'connue')} ne correspond</span>
                  </span>
                  <button type="button" style={{ ...petitBouton, color: accent }} disabled={disabled || !!action} onClick={() => setModal(fiche())}>
                    Créer {voc.le('fournisseur')}…
                  </button>
                </>
              )}
              {action && <span style={{ fontSize: '0.74rem', color: accent }}>{action}</span>}
            </div>
            {lu.matricule?.note && <div style={{ fontSize: '0.74rem', color: lu.matricule.aRelire ? '#b45309' : 'var(--text-muted)', marginLeft: 100 }}>Matricule : {lu.matricule.note}.</div>}
            {autreChoisi && choisiNom && (
              <div style={encart('#fffbeb', '#fde68a', '#92400e')}>⚠️ La facture semble venir de {reconnu?.nom}, mais « {choisiNom} » est choisi dans le bloc.</div>
            )}
            {refDiffere && (
              <div style={encart('#fffbeb', '#fde68a', '#92400e')}>⚠️ Le n° lu sur la facture ({lu.numero?.valeur}) diffère du n° saisi ({refFacture.trim()}).</div>
            )}
            {actionErreur && <div style={encart('#fee2e2', '#fecaca', '#dc2626')}>{actionErreur}</div>}

            {/* Numéro, date, totaux */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px', fontSize: '0.8rem' }}>
              <span><strong>N° :</strong> {lu.numero?.valeur ?? '—'}{lu.numero?.note ? <em style={{ color: '#b45309' }}> ({lu.numero.note})</em> : null}</span>
              <span><strong>Date :</strong> {lu.date ? fmtDate(lu.date.valeur) : '—'}{lu.date?.note ? <em style={{ color: '#b45309' }}> ({lu.date.note})</em> : null}</span>
              {t && <span><strong>HT :</strong> {fmt(t.ht)}</span>}
              {t?.fodec != null && <span><strong>FODEC :</strong> {fmt(t.fodec)}</span>}
              {t && <span><strong>TVA :</strong> {fmt(t.tva)}{t.parTaux.length > 1 ? ` (${t.parTaux.map((x) => `${x.taux} %`).join(', ')})` : ''}</span>}
              {t && <span><strong>Timbre :</strong> {fmt(t.timbre)}</span>}
              {t && <span><strong>TTC :</strong> {fmt(t.ttc)} {t.coherents === true ? <span style={{ color: '#15803d' }} title="HT + TVA + timbre = TTC">✓</span> : t.coherents === false ? <span style={{ color: '#b45309' }}>⚠</span> : null}</span>}
            </div>
            {lu.date && dateChoisie && (
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Date lue {fmtDate(lu.date.valeur)} :{' '}
                <button type="button" style={{ ...petitBouton, padding: '1px 8px' }} disabled={disabled || lu.date.valeur < dateMin || lu.date.valeur > dateMax}
                  onClick={() => onRemplir({ date: lu.date!.valeur })}>la prendre</button>
              </div>
            )}
            {lu.avertissements.map((a) => <div key={a} style={encart('#fffbeb', '#fde68a', '#92400e')}>⚠️ {a}</div>)}
            {lu.lignes.length > 0 && (
              <details>
                <summary style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155', cursor: 'pointer' }}>Texte lu ({lu.lignes.length} lignes)</summary>
                <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', padding: '4px 8px', fontSize: '0.72rem', whiteSpace: 'pre-wrap' }}>
                  {lu.lignes.join('\n')}
                </div>
              </details>
            )}
          </>
        )}
      </div>
      )}

      {visible && modal && (
        <NouveauFournisseurModal
          initiale={modal}
          cible={cible}
          fournisseursDuCompte={compte}
          onFermer={() => setModal(null)}
          onCree={async (id, nom, matricule) => {
            setModal(null);
            const g = generation.current;
            let liste = true;
            try { await onFournisseursModifies(); } catch { liste = false; }
            if (!montee.current || g !== generation.current) return;
            courant.current.onRemplir({ fournisseurId: String(id) });
            setRapp({ etat: 'reconnu', fournisseur: { id, nom, matriculeFiscal: matricule }, par: 'matricule' });
            if (lu) courant.current.onResultat(resumer(lu, rapp, 'nouveau'));
            if (!liste) setActionErreur(`${voc.Nom('fournisseur')} ${voc.acc('fournisseur', 'créé', 'créée')}, mais la liste n'a pas pu être rechargée : rechargez la page avant d'enregistrer.`);
          }}
          onExistant={(f, saisie) => {
            setModal(null);
            void choisir(f, f.matriculeFiscal ? null : saisie.matriculeFiscal || null, saisie.raisonSociale || null, 'choisi');
          }}
          erreurCode={codeErreur}
        />
      )}
    </>
  );
}
