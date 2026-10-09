import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import api from '../../api/client';
import { useConfirm } from '../../components/common/ConfirmDialog';
import BoutonAide from '../BoutonAide';
import { ChoixCompte } from '../ChoixCompte';
import { ChoixTiers } from '../ChoixTiers';
import { Modale } from '../DossierFormulaires';
import { FenetreImport } from '../FenetreImport';
import { messageDossier, statutDe, texteEtatAbonnement } from '../dossiers';
import {
  LIBELLES_ETAT, PAGE_ECRITURES, aideRetenue, aideTaxe, aideTaxePossible, ajouterJours, aujourdhui, contrepasserEcriture, controlerDate, controlerMontant, fmtJour, fmtMontant, importerBalanceOuverture, importerEcritures, libellePeriode,
  ligneEnvoyee, lireEcriture, lireEcritures, periodeDe, periodeOuverteSuivante, telechargerModeleBalanceOuverture, telechargerModeleEcritures, texteTaxe, totaux, typeTiersDe, validerEcriture, validerPeriode, versMillimes,
  type AideReponse, type ContrepassationReponse, type Ecriture, type EcritureReponse, type EcrituresReponse, type EtatEcriture, type LigneSaisie, type SuppressionReponse, type TiersCourt,
} from '../ecritures';
import { bouton, inp, lbl, pastille, petit } from '../styles';

// « Écritures » (LabFlow Compta, étape S6a ; labflow-reprise/achats-compta/PLAN-S6.md §2, §4 ; réponses du client du
// 08/10 — « ok pour les 8 ») : les écritures en brouillard d'un dossier, par pages de 25 avec les filtres côté serveur
// (journal, période — le mois en cours par défaut —, état, recherche sur le libellé, la pièce ou un montant) et « Afficher
// plus » (modèle de la page Tiers) ; une écriture se déplie pour montrer ses lignes ; saisie guidée dans une fenêtre
// (journal, date dans une période ouverte, pièce, libellé, grille des lignes : compte imputable, tiers sur un collectif,
// débit ou crédit en millimes, code de taxe, échéance ; pied débits / crédits / écart ; « Ajouter la TVA » et « Ajouter
// la retenue » calculés par le serveur, modifiables) ; modifier et supprimer une écriture en brouillard (titulaire,
// Complet ou Saisie). Une écriture rend l'écriture touchée et les comptes rendus ; la fenêtre chargée est relue d'un coup ;
// un refus sur un état périmé (404, 409 hors refus corrigeables) ferme la fenêtre et relit (convention de S3c).
// S6b (PLAN-S6 §2 « S6b » ; réponses 2, 4 et 5 du 08/10) : « Valider » une écriture (définitif, numéro définitif continu par
// journal et par exercice, auteur et heure), « Valider la période » (toutes celles du mois choisi), « Contre-passer » une
// écriture validée (écriture inverse, liée des deux côtés), vraie date d'une opération d'une période close (enregistrée au
// premier jour de la période ouverte suivante, NC 01 §61) ; la page s'ouvre sur une période donnée (?periode=…).
// S6c (PLAN-S6 §2 « S6c », §4 « Imports ») : « Importer (Excel) » (des écritures en brouillard, modèle de LabFlow Compta, tout ou
// rien) et « Balance d'ouverture » (une écriture d'à-nouveaux AN au premier jour de l'exercice, en brouillard) — titulaire
// et Complet ; la fenêtre d'import partagée (FenetreImport) montre le rapport rangée par rangée d'un fichier refusé.
type Fenetre = { type: 'creer' } | { type: 'modifier'; ecriture: Ecriture } | { type: 'contrepasser'; ecriture: Ecriture } | { type: 'importer' } | { type: 'importer-balance' } | null;
type Role = 'titulaire' | 'gerant';
type Refus = (err: unknown) => boolean;
// Refus que la personne corrige dans la fenêtre (le serveur dit quoi) ; les autres 409 (écriture validée, dossier archivé…) ferment la fenêtre.
const CORRIGEABLES = ['DESEQUILIBRE', 'COMPTES_IDENTIQUES', 'TOTAL_TROP_GRAND', 'TIERS_REQUIS', 'TIERS_INTERDIT', 'TIERS_TYPE', 'TIERS_DESACTIVE', 'COMPTE_NON_IMPUTABLE', 'TAXE_DESACTIVEE', 'JOURNAL_DESACTIVE', 'DATE_HORS_EXERCICE', 'PERIODE_CLOSE', 'PERIODE_ABSENTE', 'EXERCICE_CLOS', 'ASSIETTE_TTC', 'ASSIETTE_TVA', 'ASSIETTE_NULLE', 'MONTANT_NUL', 'LIGNE_SANS_CODE', 'CODE_NON_RETENUE', 'RETENUE_ABSENTE', 'JOURNAL_SANS_RETENUE', 'TAXE_SANS_COMPTE', 'AN_DATE'];
const codeDe = (err: unknown) => (err as { response?: { data?: { code?: string } } })?.response?.data?.code;
const messageDe = (err: unknown) => (err as { response?: { data?: { message?: string } } })?.response?.data?.message || '';
// Un refus « périmé » ferme la fenêtre et relit (dossier ou écriture disparus, écriture validée, dossier archivé…) ; un
// 404 sur un compte, un tiers ou un code d'une ligne se corrige sur place, comme les 400 et les 409 corrigeables.
const refusPerime = (err: unknown) => {
  const s = statutDe(err);
  if (s === 404) return /Dossier introuvable|Écriture introuvable/.test(messageDe(err));
  return s === 409 && !CORRIGEABLES.includes(codeDe(err) || '');
};
const LIBELLES_ORIGINE: Record<Ecriture['origine'], string> = { saisie: 'saisie', import: 'import', contrepassation: 'contre-passation' };
const NATURES_TVA = ['tva_deductible', 'tva_collectee', 'tva_a_payer'];
const mono = 'ui-monospace, monospace';
const pluriel = (n: number, un: string, des: string) => `${n} ${n > 1 ? des : un}`;

// Une page par dossier : changer de dossier (navigation directe) repart d'un état neuf.
export default function ComptaEcrituresPage() {
  const { dossierId } = useParams();
  return <ComptaEcritures key={dossierId} dossierId={dossierId} />;
}

function ComptaEcritures({ dossierId }: { dossierId?: string }) {
  const { confirm } = useConfirm();
  // S6b : la page Périodes ouvre les écritures d'une période (?periode=…) ; le mois en cours n'est alors pas posé.
  const [parametres] = useSearchParams();
  const periodeInitiale = Number(parametres.get('periode')) || null;
  // `lu` : la dernière réponse (en-tête, droits, choix de la saisie, total), les écritures accumulées depuis la page 1, et
  // la clé (journal, période, état, recherche) qu'elle sert — une relecture en route se voit à la différence avec la clé.
  const [lu, setLu] = useState<{ cle: string; etat: EcrituresReponse; lignes: Ecriture[] } | null>(null);
  const [etatPage, setEtatPage] = useState<'chargement' | 'pret' | 'introuvable'>('chargement');
  const [erreurLecture, setErreurLecture] = useState(false);
  const [journalId, setJournalId] = useState<number | null>(null);
  const [periodeId, setPeriodeId] = useState<number | null>(periodeInitiale);
  const [etatFiltre, setEtatFiltre] = useState<EtatEcriture | ''>('');
  const [recherche, setRecherche] = useState('');
  const [q, setQ] = useState('');
  const [plus, setPlus] = useState(false);
  const [enRelecture, setEnRelecture] = useState(false);
  const [fenetre, setFenetre] = useState<Fenetre>(null);
  const [info, setInfo] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const occupeRef = useRef(false);
  // Les écritures dépliées et leurs lignes (lues à la demande ; remplacées après une modification ; retirées du cache
  // quand une relecture montre qu'une autre personne les a changées — `modifieLe` diffère). Miroirs en ref pour les
  // lectures asynchrones.
  const [depliees, setDepliees] = useState<Set<number>>(() => new Set());
  const [details, setDetails] = useState<Map<number, Ecriture | 'lecture' | 'erreur'>>(() => new Map());
  const deplieesRef = useRef(depliees);
  const detailsRef = useRef(details);
  useEffect(() => { deplieesRef.current = depliees; }, [depliees]);
  useEffect(() => { detailsRef.current = details; }, [details]);
  // Le mois en cours est posé une fois, à la première réponse (il faut connaître les périodes de l'exercice).
  const defautPose = useRef(!!periodeInitiale);
  // Une période demandée dans l'adresse qui n'est pas dans l'exercice ouvert (autre dossier, faute de frappe) : jugée une
  // fois à la première réponse, puis toutes les périodes (relecture de S6b).
  const periodeInitialeJugee = useRef(false);
  const tour = useRef(0);
  const cle = `${journalId ?? ''}\u0000${periodeId ?? ''}\u0000${etatFiltre}\u0000${q}`;

  // Les lignes d'une écriture, lues à la demande (dépliage, relecture après une modification venue d'ailleurs).
  const lireDetail = useCallback((id: number) => {
    setDetails((m) => { const n = new Map(m); n.set(id, 'lecture'); return n; });
    lireEcriture(dossierId || '', id)
      .then((e) => setDetails((m) => { const n = new Map(m); n.set(id, e); return n; }))
      .catch(() => setDetails((m) => { const n = new Map(m); n.set(id, 'erreur'); return n; }));
  }, [dossierId]);

  useEffect(() => { const t = setTimeout(() => setQ(recherche.trim()), 300); return () => clearTimeout(t); }, [recherche]);
  const charger = useCallback((page: number, limite: number = PAGE_ECRITURES) => {
    const moi = ++tour.current;
    lireEcritures(dossierId || '', { journalId, periodeId, etat: etatFiltre, q, page, limite })
      .then((r) => {
        if (moi !== tour.current) return;
        if (!defautPose.current) {
          defautPose.current = true;
          const courante = r.exercice ? periodeDe(r.exercice.periodes, aujourdhui()) : null;
          // Le mois en cours existe dans l'exercice : la page le choisit et relit (une seule fois).
          if (courante) { setPeriodeId(courante.id); return; }
        } else if (periodeInitiale && !periodeInitialeJugee.current) {
          periodeInitialeJugee.current = true;
          if (!r.exercice || !r.exercice.periodes.some((p) => p.id === periodeInitiale)) {
            setPeriodeId(null);
            setInfo('La période demandée n\'est pas dans l\'exercice ouvert de ce dossier : toutes les périodes sont affichées.');
            return;
          }
        }
        setLu((prev) => {
          const reprise = page === 1 || !prev || prev.cle !== cle;
          const vus = new Set(reprise ? [] : prev.lignes.map((e) => e.id));
          return { cle, etat: r, lignes: reprise ? r.ecritures : [...prev.lignes, ...r.ecritures.filter((e) => !vus.has(e.id))] };
        });
        // Lignes en cache périmées (écriture modifiée par quelqu'un d'autre) : retirées, relues si l'écriture est dépliée.
        const perimees = r.ecritures.filter((e) => { const d = detailsRef.current.get(e.id); return !!d && d !== 'lecture' && d !== 'erreur' && d.modifieLe !== e.modifieLe; }).map((e) => e.id);
        if (perimees.length) {
          setDetails((m) => { const n = new Map(m); perimees.forEach((id) => n.delete(id)); return n; });
          perimees.filter((id) => deplieesRef.current.has(id)).forEach(lireDetail);
        }
        setEtatPage('pret');
        setErreurLecture(false);
      })
      .catch((err) => {
        if (moi !== tour.current) return;
        if (statutDe(err) === 404) setEtatPage('introuvable'); else setErreurLecture(true);
      })
      .finally(() => { if (moi === tour.current) { setPlus(false); setEnRelecture(false); } });
  }, [dossierId, journalId, periodeId, etatFiltre, q, cle, lireDetail, periodeInitiale]);
  useEffect(() => { charger(1); return () => { tour.current += 1; }; }, [charger]);

  const etat = lu?.etat ?? null;
  const lignes = lu?.lignes ?? [];
  const relecture = !!lu && lu.cle !== cle;
  const lecture = relecture || plus || enRelecture;
  const role: Role = etat?.dossier.espace.role || 'titulaire';
  const ouvert = !!etat && etat.etatAbonnement === 'actif';
  const dossierActif = !!etat && etat.dossier.etat === 'actif';
  const peutSaisir = !!etat && etat.droits.saisir && dossierActif && ouvert;
  // S6b : valider, valider la période et contre-passer = titulaire ou Complet (droit « configurer »).
  const peutValider = !!etat && etat.droits.configurer && dossierActif && ouvert;

  const relireFenetre = useCallback(() => {
    const n = lu ? lu.lignes.length : 0;
    setEnRelecture(true);
    charger(1, Math.min(200, Math.max(PAGE_ECRITURES, Math.ceil(n / PAGE_ECRITURES) * PAGE_ECRITURES)));
  }, [lu, charger]);
  // Après une écriture : comptes rendus mis à jour, lignes de l'écriture touchée remplacées, fenêtre chargée relue. Une
  // écriture enregistrée doit se voir : les filtres qui l'excluraient (la facture de septembre saisie en octobre, un
  // journal, un état, une recherche) sont levés — la clé change, la liste se relit ; le message le dit.
  const appliquer = (nb: EcrituresReponse['nb'], message: string, ecriture?: Ecriture, retirer?: number) => {
    setLu((prev) => (prev ? { ...prev, etat: { ...prev.etat, nb, total: retirer ? Math.max(0, prev.etat.total - 1) : prev.etat.total }, lignes: retirer ? prev.lignes.filter((e) => e.id !== retirer) : prev.lignes } : prev));
    if (ecriture) setDetails((m) => { const n = new Map(m); n.set(ecriture.id, ecriture); return n; });
    if (retirer) setDepliees((s) => { const n = new Set(s); n.delete(retirer); return n; });
    setErreur('');
    setFenetre(null);
    const ajustes: string[] = [];
    if (ecriture) {
      const p = periodeId && etat?.exercice ? periodeDe(etat.exercice.periodes, ecriture.date) : null;
      if (periodeId && p && p.id !== periodeId) { setPeriodeId(p.id); ajustes.push(`période ${libellePeriode(p)}`); }
      if (journalId && journalId !== ecriture.journal.id) { setJournalId(null); ajustes.push('tous les journaux'); }
      if (etatFiltre && etatFiltre !== ecriture.etat) { setEtatFiltre(''); ajustes.push('tous les états'); }
      if (q) { setRecherche(''); setQ(''); ajustes.push('recherche effacée'); }
    }
    setInfo(ajustes.length ? `${message} Filtres ajustés pour la montrer : ${ajustes.join(', ')}.` : message);
    if (!ajustes.length) relireFenetre();
  };
  const refus: Refus = (err) => {
    const s = statutDe(err);
    if (s !== 404 && s !== 409) return false;
    setFenetre(null);
    setInfo('');
    setErreur(messageDossier(err, 'Action impossible : la liste a été relue.', role));
    charger(1);
    return true;
  };
  // S6b : une écriture validée reste à sa place dans la liste (état et numéro définitif mis à jour, lignes remplacées) ;
  // les comptes rendus (dossier, période filtrée) suivent la réponse. Les filtres ne bougent pas ; sous le filtre « état »
  // (brouillard), l'écriture sort de la vue : la fenêtre chargée est relue (sinon « Afficher plus » sauterait une écriture
  // et le total compterait un de trop — relecture de S6b).
  const sansLignes = (e: Ecriture): Ecriture => { const copie = { ...e }; delete copie.lignes; return copie; };
  const appliquerValidation = (r: EcritureReponse) => {
    setLu((prev) => (prev ? {
      ...prev,
      etat: { ...prev.etat, nb: r.nb, periode: prev.etat.periode && prev.etat.periode.id === periodeId && periodeDe(prev.etat.exercice?.periodes ?? [], r.ecriture.date)?.id === periodeId ? { ...prev.etat.periode, nbBrouillard: Math.max(0, prev.etat.periode.nbBrouillard - 1), nbValidees: prev.etat.periode.nbValidees + 1 } : prev.etat.periode },
      lignes: prev.lignes.map((x) => (x.id === r.ecriture.id ? sansLignes(r.ecriture) : x)),
    } : prev));
    setDetails((m) => { const n = new Map(m); n.set(r.ecriture.id, r.ecriture); return n; });
    setErreur('');
    setInfo(`Écriture ${r.ecriture.numero} validée (définitif).`);
    if (etatFiltre) relireFenetre();
  };
  const valider = async (e: Ecriture) => {
    if (!etat || occupeRef.current) return;
    const ok = await confirm({
      title: `Valider l'écriture ${e.numeroProvisoire} ?`,
      message: `« ${e.libelle} » du ${fmtJour(e.date)} (${e.journal.code}, pièce ${e.reference}, ${fmtMontant(e.total)} D) recevra son numéro définitif, continu dans le journal ${e.journal.code} pour l'exercice. C'est définitif : elle ne se modifiera plus et ne se supprimera plus ; une erreur se corrigera par contre-passation.`,
      details: ['Pour une numérotation dans l\'ordre des dates, validez plutôt toute la période : filtrez la période puis « Valider la période », ou page Périodes, « Valider tout ».'],
      tone: 'primary',
      confirmLabel: 'Valider',
      icon: '🔏',
    });
    if (!ok || occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    try {
      appliquerValidation(await validerEcriture(etat.dossier.id, e.id));
    } catch (err) {
      if (!refus(err)) setErreur(messageDossier(err, 'Validation impossible, réessayez.', role));
    } finally {
      occupeRef.current = false;
      setOccupe(false);
    }
  };
  // Toutes les écritures en brouillard de la période filtrée, dans l'ordre des dates : la fenêtre chargée est relue (les
  // lignes dépliées se relisent d'elles-mêmes : leur date de modification change).
  const validerLaPeriode = async () => {
    if (!etat || !etat.periode || occupeRef.current) return;
    const p = etat.periode;
    const ok = await confirm({
      title: `Valider les écritures de ${libellePeriode(p)} ?`,
      message: `${pluriel(p.nbBrouillard, 'écriture en brouillard', 'écritures en brouillard')}${journalId ? ', tous journaux confondus (le filtre Journal ne limite pas la validation),' : ''} vont être validées dans l'ordre des dates : chacune reçoit son numéro définitif (continu par journal et par exercice). C'est définitif : une écriture validée ne se modifie plus et ne se supprime plus ; elle se contre-passe.`,
      tone: 'primary',
      confirmLabel: 'Valider la période',
      icon: '🔏',
    });
    if (!ok || occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    try {
      const r = await validerPeriode(etat.dossier.id, p.id);
      setErreur('');
      setInfo(`${pluriel(r.validees, 'écriture validée', 'écritures validées')} pour ${libellePeriode(p)} (définitif).`);
      relireFenetre();
    } catch (err) {
      if (!refus(err)) setErreur(messageDossier(err, 'Validation impossible, réessayez.', role));
    } finally {
      occupeRef.current = false;
      setOccupe(false);
    }
  };
  // La contre-passation : l'écriture inverse (nouvelle) se montre comme une écriture enregistrée ; l'origine est relue
  // (son lien « annulée par »).
  const appliquerContrepassation = (r: ContrepassationReponse) => {
    setLu((prev) => (prev ? { ...prev, lignes: prev.lignes.map((x) => (x.id === r.origine.id ? sansLignes(r.origine) : x)) } : prev));
    setDetails((m) => { const n = new Map(m); n.set(r.origine.id, r.origine); return n; });
    // S7a : des lettres défaites en bloc touchent d'autres écritures (le règlement lettré avec l'origine) : leurs lignes lues
    // sont oubliées, et relues si elles sont dépliées (leur pastille de lettre disparaît).
    if (r.delettrees?.length) {
      const autres = [...details.keys()].filter((id) => id !== r.origine.id && id !== r.ecriture.id);
      setDetails((m) => { const n = new Map(m); autres.forEach((id) => n.delete(id)); return n; });
      autres.filter((id) => deplieesRef.current.has(id)).forEach(lireDetail);
    }
    // S7a : les lettres défaites d'office sont dites.
    const delettrees = r.delettrees?.length ? ` Lettres défaites : ${r.delettrees.join(', ')} (lettrez l'écriture avec sa contre-passation, page Lettrage).` : '';
    appliquer(r.nb, `Contre-passation ${r.ecriture.numero} enregistrée et validée (${fmtMontant(r.ecriture.total)} D) : elle annule ${r.origine.numero}.${delettrees}`, r.ecriture);
  };
  // Contre-passer : l'écriture validée est relue à l'instant (ses lignes, son lien).
  const contrepasser = async (e: Ecriture) => {
    if (!etat || occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    setInfo('');
    try {
      const d = await lireEcriture(etat.dossier.id, e.id);
      setDetails((m) => { const n = new Map(m); n.set(e.id, d); return n; });
      setLu((prev) => (prev ? { ...prev, lignes: prev.lignes.map((x) => (x.id === d.id ? sansLignes(d) : x)) } : prev));
      // Contre-passée entre-temps par quelqu'un d'autre : rien à ouvrir, la ligne relue le montre.
      if (d.contrepasseePar) { setErreur(`L'écriture ${d.numero} est déjà contre-passée par ${d.contrepasseePar.numero}.`); return; }
      setFenetre({ type: 'contrepasser', ecriture: d });
    } catch (err) {
      if (!refus(err)) setErreur(messageDossier(err, 'Écriture impossible à relire, réessayez.', role));
    } finally {
      occupeRef.current = false;
      setOccupe(false);
    }
  };
  // S6c : après un import, les comptes rendus suivent et les filtres sont levés (les écritures importées peuvent être de
  // n'importe quel mois, journal, état) : la liste se relit entière, le message dit combien.
  const apresImport = (nb: EcrituresReponse['nb'], message: string) => {
    setLu((prev) => (prev ? { ...prev, etat: { ...prev.etat, nb } } : prev));
    setErreur('');
    setFenetre(null);
    setInfo(message);
    const memesFiltres = !periodeId && !journalId && !etatFiltre && !q;
    setPeriodeId(null);
    setJournalId(null);
    setEtatFiltre('');
    setRecherche('');
    setQ('');
    if (memesFiltres) relireFenetre();
  };
  // Déplier une écriture : ses lignes sont lues une fois.
  const basculer = (e: Ecriture) => {
    const ouverte = depliees.has(e.id);
    setDepliees((s) => { const n = new Set(s); if (ouverte) n.delete(e.id); else n.add(e.id); return n; });
    if (ouverte || (details.get(e.id) && details.get(e.id) !== 'erreur')) return;
    lireDetail(e.id);
  };
  const supprimer = async (e: Ecriture) => {
    if (!etat || occupeRef.current) return;
    const ok = await confirm({
      title: `Supprimer l'écriture ${e.numeroProvisoire} ?`,
      message: `« ${e.libelle} » du ${fmtJour(e.date)} (${e.journal.code}, pièce ${e.reference}, ${fmtMontant(e.total)} D) sera retirée du dossier avec ses lignes. Le journal de la comptabilité en garde tout le contenu.`,
      details: ['Une écriture validée ne se supprime jamais : elle se contre-passe.'],
      tone: 'danger',
      confirmLabel: 'Supprimer',
    });
    if (!ok || occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    try {
      const { data } = await api.delete(`/api/compta/dossiers/${etat.dossier.id}/ecritures/${e.id}`);
      const r = data as SuppressionReponse;
      appliquer(r.nb, `Écriture ${r.supprime.numeroProvisoire} supprimée.`, undefined, e.id);
    } catch (err) {
      if (!refus(err)) setErreur(messageDossier(err, 'Suppression impossible, réessayez.', role));
    } finally {
      occupeRef.current = false;
      setOccupe(false);
    }
  };
  // Modifier : l'écriture est relue à l'instant (jamais une version en cache qu'une autre personne aurait dépassée).
  const modifier = async (e: Ecriture) => {
    if (!etat || occupeRef.current) return;
    occupeRef.current = true;
    setOccupe(true);
    setInfo('');
    try {
      const d = await lireEcriture(etat.dossier.id, e.id);
      setDetails((m) => { const n = new Map(m); n.set(e.id, d); return n; });
      setFenetre({ type: 'modifier', ecriture: d });
    } catch (err) {
      if (!refus(err)) setErreur(messageDossier(err, 'Écriture impossible à relire, réessayez.', role));
    } finally {
      occupeRef.current = false;
      setOccupe(false);
    }
  };

  const retour = etat ? { lien: `/dossiers/${etat.dossier.id}`, libelle: etat.dossier.nom } : null;
  const periodes = etat?.exercice?.periodes ?? [];
  return (
    <div className="page">
      <div style={{
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4338ca 55%, #7c3aed 100%)', borderRadius: 18, padding: '24px 28px',
        marginBottom: 24, boxShadow: '0 8px 32px rgba(67,56,202,0.28)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
      }}>
        <div style={{ minWidth: 0 }}>
          {retour && <Link to={retour.lien} style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.78rem', fontWeight: 700, textDecoration: 'none' }}>← {retour.libelle}</Link>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, padding: '7px 9px', fontSize: '1.2rem' }}>✍️</div>
            <h1 style={{ fontSize: '1.55rem', fontWeight: 900, color: '#fff', margin: 0 }}>Écritures</h1>
            {etat?.dossier.etat === 'archive' && <span style={pastille('rgba(255,255,255,0.25)', '#fff')}>Dossier archivé</span>}
          </div>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.85rem', margin: 0 }}>
            {etat
              ? `${pluriel(etat.nb.brouillard, 'écriture en brouillard', 'écritures en brouillard')} · ${pluriel(etat.nb.validees, 'validée', 'validées')}${etat.exercice ? ` · exercice du ${fmtJour(etat.exercice.debut)} au ${fmtJour(etat.exercice.fin)}` : ' · aucun exercice ouvert'}`
              : 'La saisie des écritures du dossier, en brouillard : partie double, pièce justificative, aide à la TVA et aux retenues'}
          </p>
        </div>
        <BoutonAide section="compta-ecritures" />
      </div>

      {etatPage === 'chargement' && !erreurLecture && <div className="loading-text">Chargement…</div>}
      {erreurLecture && (
        <div role="alert" style={{ ...alerte, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: lu ? 12 : 0 }}>
          <span>{lu ? 'Impossible de relire les écritures.' : 'Impossible de charger les écritures.'}</span>
          <button type="button" onClick={relireFenetre} style={bouton('#b91c1c', '#fff', '#b91c1c')}>Réessayer</button>
        </div>
      )}
      {etatPage === 'introuvable' && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '22px 24px', maxWidth: 640 }}>
          <div style={{ fontWeight: 800, color: '#1e1b4b', marginBottom: 6 }}>Ce dossier n'existe pas ou ne vous est pas ouvert</div>
          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.6 }}>
            Il a peut-être été supprimé, ou son accès vous a été retiré. <Link to="/" style={{ color: '#4338ca', fontWeight: 700 }}>Retour à vos comptabilités</Link>
          </p>
        </div>
      )}

      {etat && etatPage === 'pret' && (
        <>
          {!ouvert && (
            <div role="status" style={{ ...alerte, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', marginBottom: 16 }}>
              {texteEtatAbonnement(etat.etatAbonnement, role)} : les écritures restent consultables mais ne se saisissent plus.
            </div>
          )}
          {etat.dossier.etat === 'archive' && ouvert && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Dossier archivé : ses écritures se lisent mais ne se saisissent pas tant qu'il n'est pas désarchivé.
            </div>
          )}
          {ouvert && dossierActif && !etat.droits.saisir && (
            <div role="status" style={{ ...alerte, background: '#f8fafc', borderColor: '#cbd5e1', color: '#475569', marginBottom: 16 }}>
              Votre niveau d'accès permet de consulter les écritures ; le titulaire et les gérants de niveau Complet ou Saisie les saisissent.
            </div>
          )}
          {!etat.exercice && (
            <div role="status" style={{ ...alerte, background: '#fef3c7', borderColor: '#fcd34d', color: '#92400e', marginBottom: 16 }}>
              Aucun exercice ouvert dans ce dossier : aucune écriture ne peut être datée.
            </div>
          )}
          {info && <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#166534', fontWeight: 600 }}>{info}</div>}
          {erreur && <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '0.82rem', color: '#dc2626' }}>{erreur}</div>}

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <label htmlFor="fe-journal" style={lbl}>Journal</label>
              <select id="fe-journal" value={journalId ?? ''} onChange={(e) => { setJournalId(e.target.value ? Number(e.target.value) : null); setInfo(''); }} style={{ ...inp, width: 'auto', minWidth: 150 }}>
                <option value="">Tous les journaux</option>
                {etat.journaux.map((j) => <option key={j.id} value={j.id}>{j.code} — {j.libelle}{j.actif ? '' : ' (désactivé)'}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="fe-periode" style={lbl}>Période</label>
              <select id="fe-periode" value={periodeId ?? ''} onChange={(e) => { setPeriodeId(e.target.value ? Number(e.target.value) : null); setInfo(''); }} style={{ ...inp, width: 'auto', minWidth: 170 }}>
                <option value="">Toutes les périodes</option>
                {periodes.map((p) => <option key={p.id} value={p.id}>{libellePeriode(p)}{p.etat === 'close' ? ' (close)' : ''}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="fe-etat" style={lbl}>État</label>
              <select id="fe-etat" value={etatFiltre} onChange={(e) => { setEtatFiltre(e.target.value as EtatEcriture | ''); setInfo(''); }} style={{ ...inp, width: 'auto', minWidth: 130 }}>
                <option value="">Toutes</option>
                {etat.etats.map((x) => <option key={x.valeur} value={x.valeur}>{x.libelle}{x.valeur === 'brouillard' ? '' : 's'}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <label htmlFor="fe-q" style={lbl}>Recherche</label>
              <input id="fe-q" type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Libellé, pièce ou montant (ex. 1190,500)" aria-label="Rechercher une écriture" style={inp} autoComplete="off" />
            </div>
            {peutSaisir && etat.exercice && <button type="button" onClick={() => { setInfo(''); setFenetre({ type: 'creer' }); }} disabled={occupe || lecture} style={{ ...bouton('linear-gradient(135deg,#4338ca,#6366f1)', '#fff', 'transparent'), marginBottom: 1 }}>+ Écriture</button>}
            {peutValider && etat.periode && etat.periode.etat === 'ouverte' && etat.periode.nbBrouillard > 0 && (
              <button type="button" onClick={validerLaPeriode} disabled={occupe || lecture} title={`${pluriel(etat.periode.nbBrouillard, 'écriture en brouillard', 'écritures en brouillard')} dans ${libellePeriode(etat.periode)}`} style={{ ...bouton('#eef2ff', '#4338ca', '#c7d2fe'), marginBottom: 1 }}>
                🔏 Valider la période ({etat.periode.nbBrouillard})
              </button>
            )}
            {peutValider && etat.exercice && <button type="button" onClick={() => { setInfo(''); setFenetre({ type: 'importer' }); }} disabled={occupe || lecture} title="Importer des écritures préparées dans le modèle Excel (en brouillard, tout ou rien)" style={{ ...bouton('#eef2ff', '#4338ca', '#c7d2fe'), marginBottom: 1 }}>📤 Importer (Excel)</button>}
            {peutValider && etat.exercice && <button type="button" onClick={() => { setInfo(''); setFenetre({ type: 'importer-balance' }); }} disabled={occupe || lecture} title="Importer la balance d'ouverture d'un dossier repris d'un autre logiciel (une écriture d'à-nouveaux, en brouillard)" style={{ ...bouton('#fff', '#4338ca', '#c7d2fe'), marginBottom: 1 }}>📤 Balance d'ouverture</button>}
          </div>

          <div style={cadre}>
            <div style={enTeteCadre}>
              <span role="status" aria-live="polite" style={{ fontWeight: 800, color: '#1e1b4b', fontSize: '0.92rem' }}>
                {relecture ? 'Lecture…' : pluriel(etat.total, 'écriture', 'écritures')}{q ? ' pour cette recherche' : ''}
              </span>
              <span style={{ fontSize: '0.76rem', color: '#64748b' }}>De la plus récente à la plus ancienne · numéro provisoire en brouillard, définitif une fois validée</span>
            </div>
            {lignes.length === 0 && !relecture && (
              <p style={{ margin: 0, padding: '16px 18px', fontSize: '0.84rem', color: '#64748b', lineHeight: 1.6 }}>
                {etat.nb.brouillard + etat.nb.validees === 0
                  ? (peutSaisir ? 'Aucune écriture pour l\'instant : cliquez sur « + Écriture ».' : 'Aucune écriture pour l\'instant.')
                  : 'Aucune écriture ne correspond à ces filtres (journal, période, état, recherche).'}
              </p>
            )}
            <div style={{ opacity: relecture ? 0.6 : 1 }}>
              {lignes.map((e) => {
                const ouverte = depliees.has(e.id);
                const d = details.get(e.id);
                return (
                  <div key={e.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <button type="button" onClick={() => basculer(e)} aria-expanded={ouverte} aria-controls={`ecriture-${e.id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 18px', width: '100%', textAlign: 'left', border: 'none', background: ouverte ? '#f8faff' : '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.84rem', flexWrap: 'wrap' }}>
                      <span style={{ color: '#94a3b8', fontSize: '0.7rem', width: 10 }}>{ouverte ? '▾' : '▸'}</span>
                      <span style={{ fontFamily: mono, fontWeight: 800, color: '#1e1b4b', minWidth: 76 }}>{e.numero || e.numeroProvisoire}</span>
                      <span style={{ color: '#334155', minWidth: 84 }} title={e.dateReelle ? `Opération du ${fmtJour(e.dateReelle)}, enregistrée au ${fmtJour(e.date)} (période close)` : undefined}>{fmtJour(e.date)}{e.dateReelle ? <span style={{ color: '#b45309', fontSize: '0.72rem' }}> (op. {fmtJour(e.dateReelle)})</span> : null}</span>
                      <span style={pastille('#eef2ff', '#3730a3')} title={e.journal.libelle}>{e.journal.code}</span>
                      <span style={{ fontFamily: mono, fontSize: '0.78rem', color: '#64748b', minWidth: 90, overflowWrap: 'anywhere' }}>{e.reference}</span>
                      <span style={{ color: '#0f172a', fontWeight: 600, flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>{e.libelle}</span>
                      {e.origine === 'contrepassation' && <span style={pastille('#fef2f2', '#be123c')} title={`Contre-passation : annule ${e.origineNumero || 'l\'écriture d\'origine'}`}>↩ annule {e.origineNumero}</span>}
                      {e.contrepasseePar && <span style={pastille('#f1f5f9', '#475569')} title={`Annulée par la contre-passation ${e.contrepasseePar.numero}`}>annulée par {e.contrepasseePar.numero}</span>}
                      <span style={{ fontFamily: mono, fontWeight: 700, color: '#0f172a', minWidth: 110, textAlign: 'right' }}>{fmtMontant(e.total)}</span>
                      <span style={pastille(e.etat === 'validee' ? '#dcfce7' : '#fef3c7', e.etat === 'validee' ? '#166534' : '#92400e')}>{LIBELLES_ETAT[e.etat]}</span>
                    </button>
                    {ouverte && (
                      <div id={`ecriture-${e.id}`} style={{ padding: '4px 18px 12px 38px', background: '#f8faff' }}>
                        {(!d || d === 'lecture') && <div style={{ fontSize: '0.8rem', color: '#64748b', padding: '6px 0' }}>Lecture des lignes…</div>}
                        {d === 'erreur' && <div role="alert" style={{ fontSize: '0.8rem', color: '#b91c1c', padding: '6px 0' }}>Lignes impossibles à lire. <button type="button" onClick={() => lireDetail(e.id)} style={lien}>Réessayer</button></div>}
                        {d && d !== 'lecture' && d !== 'erreur' && (
                          <>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                              <thead>
                                <tr style={{ color: '#64748b', textAlign: 'left' }}>
                                  <th style={cellule}>Compte</th><th style={cellule}>Tiers</th><th style={cellule}>Libellé</th><th style={{ ...cellule, textAlign: 'right' }}>Débit</th><th style={{ ...cellule, textAlign: 'right' }}>Crédit</th><th style={cellule}>Taxe</th><th style={cellule}>Échéance</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(d.lignes || []).map((l) => (
                                  <tr key={l.id} style={{ borderTop: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                                    <td style={{ ...cellule, whiteSpace: 'nowrap' }}><span style={{ fontFamily: mono, fontWeight: 800, color: '#1e1b4b' }}>{l.compte.numero}</span> <span style={{ color: '#475569' }}>{l.compte.libelle}</span></td>
                                    <td style={cellule}>{l.tiers ? <><span style={{ fontFamily: mono, fontWeight: 700 }}>{l.tiers.code}</span> {l.tiers.nom}</> : '—'}{l.lettre && <span style={{ ...pastille('#eef2ff', '#4338ca'), marginLeft: 6, fontFamily: mono }} title="Ligne lettrée (page Lettrage)">🔗 {l.lettre}</span>}</td>
                                    <td style={{ ...cellule, color: l.libelle ? '#0f172a' : '#94a3b8' }}>{l.libelle || d.libelle}</td>
                                    <td style={{ ...cellule, textAlign: 'right', fontFamily: mono }}>{versMillimes(l.debit) ? fmtMontant(l.debit) : ''}</td>
                                    <td style={{ ...cellule, textAlign: 'right', fontFamily: mono }}>{versMillimes(l.credit) ? fmtMontant(l.credit) : ''}</td>
                                    <td style={cellule}>{l.taxe ? <span style={pastille('#f1f5f9', '#475569')}>{l.taxe.code}</span> : ''}</td>
                                    <td style={cellule}>{fmtJour(l.echeance)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr style={{ borderTop: '2px solid #c7d2fe', fontWeight: 800 }}>
                                  <td style={cellule} colSpan={3}>Totaux</td>
                                  <td style={{ ...cellule, textAlign: 'right', fontFamily: mono }}>{fmtMontant(d.total)}</td>
                                  <td style={{ ...cellule, textAlign: 'right', fontFamily: mono }}>{fmtMontant(d.total)}</td>
                                  <td style={cellule} colSpan={2} />
                                </tr>
                              </tfoot>
                            </table>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 8, fontSize: '0.74rem', color: '#64748b' }}>
                              <span>
                                Saisie par {d.creePar || '—'} le {new Date(d.creeLe).toLocaleString('fr-FR')}{d.modifieLe !== d.creeLe && d.modifieLe !== d.valideLe ? ` · modifiée le ${new Date(d.modifieLe).toLocaleString('fr-FR')}` : ''}
                                {d.etat === 'validee' && d.valideLe ? <> · <strong style={{ color: '#166534' }}>validée{d.validePar ? ` par ${d.validePar}` : ''} le {new Date(d.valideLe).toLocaleString('fr-FR')}</strong></> : null}
                                {' '}· origine : {LIBELLES_ORIGINE[d.origine] || d.origine}{d.origine === 'contrepassation' && d.origineNumero ? ` de ${d.origineNumero}` : ''}
                                {d.dateReelle ? ` · opération du ${fmtJour(d.dateReelle)}, enregistrée au ${fmtJour(d.date)} (période close)` : ''}
                                {d.contrepasseePar ? ` · annulée par la contre-passation ${d.contrepasseePar.numero}` : ''}
                              </span>
                              <span style={{ flex: 1 }} />
                              {peutValider && d.etat === 'brouillard' && <button type="button" onClick={() => valider(e)} disabled={occupe || lecture} style={petit('#eef2ff', '#4338ca', '#c7d2fe')}>🔏 Valider</button>}
                              {peutSaisir && d.etat === 'brouillard' && <button type="button" onClick={() => modifier(e)} disabled={occupe || lecture} style={petit('#f0f9ff', '#0369a1', '#bae6fd')}>✏️ Modifier</button>}
                              {peutSaisir && d.etat === 'brouillard' && <button type="button" onClick={() => supprimer(e)} disabled={occupe || lecture} style={petit('#fff', '#be123c', '#fecdd3')}>🗑 Supprimer</button>}
                              {peutValider && !!etat.exercice && d.etat === 'validee' && !d.contrepasseePar && <button type="button" onClick={() => contrepasser(e)} disabled={occupe || lecture} style={petit('#fff', '#be123c', '#fecdd3')}>↩ Contre-passer</button>}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {!relecture && lignes.length > 0 && lu && lu.lignes.length < etat.total && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
              <button type="button" onClick={() => { setPlus(true); charger(Math.floor(lu.lignes.length / PAGE_ECRITURES) + 1); }} disabled={plus || occupe || lecture} style={{ ...bouton('#fff', '#4338ca', '#c7d2fe'), opacity: plus ? 0.7 : 1 }}>
                {plus ? 'Lecture…' : `Afficher plus (${pluriel(etat.total - lu.lignes.length, 'autre', 'autres')})`}
              </button>
            </div>
          )}

          {fenetre?.type === 'creer' && <FenetreEcriture etat={etat} role={role} onClose={() => setFenetre(null)} onEnregistre={(r) => appliquer(r.nb, `Écriture ${r.ecriture.numeroProvisoire} enregistrée en brouillard (${fmtMontant(r.ecriture.total)} D).`, r.ecriture)} onRefus={refus} />}
          {fenetre?.type === 'modifier' && <FenetreEcriture etat={etat} ecriture={fenetre.ecriture} role={role} onClose={() => setFenetre(null)} onEnregistre={(r) => appliquer(r.nb, `Écriture ${r.ecriture.numeroProvisoire} modifiée (${fmtMontant(r.ecriture.total)} D).`, r.ecriture)} onRefus={refus} />}
          {fenetre?.type === 'contrepasser' && <FenetreContrepassation etat={etat} ecriture={fenetre.ecriture} role={role} onClose={() => setFenetre(null)} onEnregistre={appliquerContrepassation} onRefus={refus} />}
          {fenetre?.type === 'importer' && (
            <FenetreImport titre="Importer des écritures (Excel)" sousTitre={`${etat.dossier.nom} · en brouillard, tout ou rien`} role={role} onClose={() => setFenetre(null)} onRefus={refus}
              aide={(
                <ul style={listeAide}>
                  <li>Une rangée par ligne d'écriture ; les rangées d'une même écriture se suivent et portent le même repère dans la colonne « Écriture » (1, 2, 3…).</li>
                  <li>Journal (code), date (JJ/MM/AAAA), pièce et libellé sur la première rangée de chaque écriture.</li>
                  <li>Compte par son numéro, tiers par son code (obligatoire sur un compte collectif), code de taxe par son code, un débit OU un crédit par rangée, échéance facultative.</li>
                  <li>Mêmes règles que la saisie (partie double, période ouverte, comptes imputables) ; les écritures naissent en brouillard avec leur numéro provisoire. 2 000 rangées au plus.</li>
                </ul>
              )}
              telechargerModele={() => telechargerModeleEcritures(etat.dossier.id)}
              importer={async (f) => {
                const r = await importerEcritures(etat.dossier.id, f);
                apresImport(r.nb, `${pluriel(r.importees, 'écriture importée', 'écritures importées')} en brouillard (${r.premiere}${r.importees > 1 ? ` à ${r.derniere}` : ''} ; ${Object.entries(r.journaux).map(([code, n]) => `${code} : ${n}`).join(', ')}). Relisez-les, puis validez-les.`);
              }} />
          )}
          {fenetre?.type === 'importer-balance' && (
            <FenetreImport titre="Importer une balance d'ouverture (Excel)" sousTitre={`${etat.dossier.nom} · une écriture d'à-nouveaux au ${fmtJour(etat.exercice?.debut)}, en brouillard`} role={role} onClose={() => setFenetre(null)} onRefus={refus}
              aide={(
                <ul style={listeAide}>
                  <li>Pour un dossier repris d'un autre logiciel : une rangée par compte (et par tiers sur un compte collectif : fournisseurs, clients), solde au débit OU au crédit, en dinars.</li>
                  <li>L'import crée UNE écriture d'à-nouveaux dans le journal AN, datée du {fmtJour(etat.exercice?.debut)}, pièce AN-{(etat.exercice?.debut || '').slice(0, 4)}, en brouillard : relisez-la, puis validez-la.</li>
                  <li>Le total des débits doit égaler le total des crédits ; un exercice qui a déjà des à-nouveaux refuse l'import.</li>
                </ul>
              )}
              telechargerModele={() => telechargerModeleBalanceOuverture(etat.dossier.id)}
              importer={async (f) => {
                const r = await importerBalanceOuverture(etat.dossier.id, f);
                setDetails((m) => { const n = new Map(m); n.set(r.ecriture.id, r.ecriture); return n; });
                apresImport(r.nb, `Balance d'ouverture importée : écriture ${r.ecriture.numeroProvisoire} (journal ${r.ecriture.journal.code}, ${pluriel(r.lignes, 'ligne', 'lignes')}, ${fmtMontant(r.total)} D) en brouillard au ${fmtJour(r.ecriture.date)}. Relisez-la, puis validez-la.`);
              }} />
          )}
        </>
      )}
    </div>
  );
}

// S6b : contre-passer une écriture validée — l'écriture inverse (mêmes comptes, tiers et codes, débits et crédits échangés)
// naît validée dans le même journal, à la date choisie (du jour par défaut, dans une période ouverte, jamais avant
// l'origine), avec son libellé et sa pièce (ceux de l'origine par défaut). Le serveur décide ; l'aperçu montre l'inverse.
// Date proposée : le jour (borné par la fin de l'exercice), jamais avant l'origine ; si elle tombe dans une période close,
// le premier jour de la période ouverte suivante (relecture de S6b).
const dateContrepassation = (ecriture: Ecriture, exercice: EcrituresReponse['exercice']) => {
  const jour = aujourdhui();
  let d = exercice && jour > exercice.fin ? exercice.fin : jour;
  if (d < ecriture.date) d = ecriture.date;
  const p = exercice ? periodeDe(exercice.periodes, d) : null;
  if (exercice && p && p.etat === 'close') {
    const s = periodeOuverteSuivante(exercice.periodes, p);
    if (s) d = s.debut;
  }
  return d;
};
function FenetreContrepassation({ etat, ecriture, role, onClose, onEnregistre, onRefus }: { etat: EcrituresReponse; ecriture: Ecriture; role: Role; onClose: () => void; onEnregistre: (r: ContrepassationReponse) => void; onRefus: Refus }) {
  const exercice = etat.exercice;
  const [date, setDate] = useState(() => dateContrepassation(ecriture, exercice));
  const [libelle, setLibelle] = useState(`Contre-passation de ${ecriture.numero} : ${ecriture.libelle}`.slice(0, etat.bornes.libelleMax));
  const [reference, setReference] = useState(ecriture.reference);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const periode = exercice && /^\d{4}-\d{2}-\d{2}$/.test(date) ? periodeDe(exercice.periodes, date) : null;
  const enregistrer = async () => {
    if (envoi) return;
    const ed = controlerDate(date, exercice);
    if (ed) { setErreur(ed); return; }
    if (date < ecriture.date) { setErreur(`La contre-passation ne peut pas précéder l'écriture d'origine (${fmtJour(ecriture.date)}).`); return; }
    if (!libelle.trim()) { setErreur('Indiquez le libellé de la contre-passation.'); return; }
    if (!reference.trim()) { setErreur('Indiquez la référence de la pièce.'); return; }
    setEnvoi(true);
    setErreur(null);
    try {
      onEnregistre(await contrepasserEcriture(etat.dossier.id, ecriture.id, { date, libelle: libelle.trim(), reference: reference.trim() }));
    } catch (err) {
      if (refusPerime(err) && onRefus(err)) return;
      setErreur(messageDossier(err, 'La contre-passation n\'a pas pu être enregistrée — réessayez.', role));
      setEnvoi(false);
    }
  };
  return (
    <Modale titre={`Contre-passer l'écriture ${ecriture.numero}`} sousTitre={`${ecriture.libelle} · ${fmtJour(ecriture.date)} · ${ecriture.journal.code} · ${fmtMontant(ecriture.total)} D — l'écriture inverse sera validée aussitôt`}
      onClose={onClose} onSubmit={enregistrer} envoi={envoi} erreur={erreur} libelleEnvoi="↩ Contre-passer" largeur={760}>
      <div style={grille}>
        <div>
          <label htmlFor="fc-date" style={lbl}>Date de la contre-passation</label>
          <input id="fc-date" type="date" value={date} min={ecriture.date} max={exercice?.fin} onChange={(e) => { setDate(e.target.value); setErreur(null); }} disabled={envoi} style={inp} />
          <div style={{ fontSize: '0.72rem', color: periode ? (periode.etat === 'ouverte' ? '#166534' : '#b91c1c') : '#b45309', marginTop: 4 }}>
            {periode ? `Période : ${libellePeriode(periode)}${periode.etat === 'ouverte' ? '' : ' (close : choisissez une date dans une période ouverte)'}` : exercice ? `Hors de l'exercice (${fmtJour(exercice.debut)} → ${fmtJour(exercice.fin)})` : 'Aucun exercice ouvert'}
          </div>
        </div>
        <div>
          <label htmlFor="fc-ref" style={lbl}>Référence de la pièce</label>
          <input id="fc-ref" value={reference} onChange={(e) => { setReference(e.target.value); setErreur(null); }} disabled={envoi} maxLength={etat.bornes.referenceMax} style={{ ...inp, fontFamily: mono }} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="fc-libelle" style={lbl}>Libellé</label>
          <input id="fc-libelle" value={libelle} onChange={(e) => { setLibelle(e.target.value); setErreur(null); }} disabled={envoi} maxLength={etat.bornes.libelleMax} style={inp} />
        </div>
      </div>
      {(ecriture.lignes || []).some((l) => l.lettre) && (
        <div role="note" style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 10, fontSize: '0.78rem', color: '#92400e' }}>
          Lignes lettrées ({[...new Set((ecriture.lignes || []).filter((l) => l.lettre).map((l) => `${l.tiers?.code ?? ''} ${l.lettre}`.trim()))].join(', ')}) : la contre-passation défait ces lettres en bloc — leurs autres lignes (le règlement, par exemple) redeviennent aussi non lettrées ; lettrez ensuite l'écriture avec sa contre-passation (page Lettrage, même pièce).
        </div>
      )}
      <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Écriture inverse (aperçu)</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ color: '#64748b', textAlign: 'left' }}>
            <th style={cellule}>Compte</th><th style={cellule}>Tiers</th><th style={{ ...cellule, textAlign: 'right' }}>Débit</th><th style={{ ...cellule, textAlign: 'right' }}>Crédit</th>
          </tr>
        </thead>
        <tbody>
          {(ecriture.lignes || []).map((l) => (
            <tr key={l.id} style={{ borderTop: '1px solid #e2e8f0' }}>
              <td style={{ ...cellule, whiteSpace: 'nowrap' }}><span style={{ fontFamily: mono, fontWeight: 800, color: '#1e1b4b' }}>{l.compte.numero}</span> <span style={{ color: '#475569' }}>{l.compte.libelle}</span></td>
              <td style={cellule}>{l.tiers ? <><span style={{ fontFamily: mono, fontWeight: 700 }}>{l.tiers.code}</span> {l.tiers.nom}</> : '—'}</td>
              <td style={{ ...cellule, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}>{versMillimes(l.credit) ? fmtMontant(l.credit) : ''}</td>
              <td style={{ ...cellule, textAlign: 'right', fontFamily: mono, whiteSpace: 'nowrap' }}>{versMillimes(l.debit) ? fmtMontant(l.debit) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: '10px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
        L'écriture d'origine reste validée et porte le lien vers sa contre-passation ; l'inverse reçoit le numéro définitif suivant du journal {ecriture.journal.code}. Saisissez ensuite l'écriture correcte. Une écriture ne se contre-passe qu'une fois.
      </p>
    </Modale>
  );
}

interface PropsFenetre { etat: EcrituresReponse; ecriture?: Ecriture; role: Role; onClose: () => void; onEnregistre: (r: EcritureReponse) => void; onRefus: Refus }
let cleSuivante = 1;
const ligneVide = (): LigneSaisie => ({ cle: cleSuivante++, compteId: null, tiersId: null, libelle: '', debit: '', credit: '', taxeId: null, echeance: '' });
const depuisLigne = (l: NonNullable<Ecriture['lignes']>[number]): LigneSaisie => ({
  cle: cleSuivante++, compteId: l.compte.id, tiersId: l.tiers?.id ?? null, libelle: l.libelle || '', debit: versMillimes(l.debit) ? fmtMontant(l.debit) : '', credit: versMillimes(l.credit) ? fmtMontant(l.credit) : '', taxeId: l.taxe?.id ?? null, echeance: l.echeance || '',
});

// Saisir une écriture (journal, date, pièce, libellé, grille des lignes) ou modifier une écriture en brouillard. Le serveur
// revérifie tout ; les aides (TVA, retenue) lui demandent la ligne calculée au millime, insérée dans la grille, modifiable.
function FenetreEcriture({ etat, ecriture, role, onClose, onEnregistre, onRefus }: PropsFenetre) {
  const creation = !ecriture;
  const exercice = etat.exercice;
  const journaux = useMemo(() => etat.journaux.filter((j) => j.actif || j.id === ecriture?.journal.id), [etat.journaux, ecriture]);
  // Les choix de la grille : les comptes imputables et les tiers actifs du dossier, plus ceux que l'écriture modifiée
  // porte déjà et qui n'y sont plus (compte devenu non imputable, tiers désactivé) : montrés, marqués, à remplacer.
  const comptesChoix = useMemo(() => {
    const manquants = (ecriture?.lignes || []).filter((l) => !etat.comptes.some((c) => c.id === l.compte.id)).map((l) => ({ id: l.compte.id, numero: l.compte.numero, libelle: `${l.compte.libelle} — non imputable (désactivé ou subdivisé) : choisissez un autre compte`, nature: l.compte.nature, actif: false, feuille: false, imputable: false }));
    return manquants.length ? [...etat.comptes, ...manquants.filter((m, i) => manquants.findIndex((x) => x.id === m.id) === i)] : etat.comptes;
  }, [etat.comptes, ecriture]);
  const tiersChoix = useMemo(() => {
    const liste = [...etat.tiers];
    for (const l of ecriture?.lignes || []) {
      if (l.tiers && !liste.some((t) => t.id === l.tiers?.id)) liste.push({ id: l.tiers.id, type: l.tiers.type, typeLibelle: l.tiers.type === 'fournisseur' ? 'Fournisseur' : 'Client', code: l.tiers.code, nom: `${l.tiers.nom} — désactivé (page Tiers)`, compteId: l.compte.id, delaiPaiement: 0, retenue: null });
    }
    return liste;
  }, [etat.tiers, ecriture]);
  const comptesParId = useMemo(() => new Map(comptesChoix.map((c) => [c.id, c])), [comptesChoix]);
  const taxesParId = useMemo(() => new Map(etat.taxes.map((x) => [x.id, x])), [etat.taxes]);
  const tiersParId = useMemo(() => new Map(tiersChoix.map((t) => [t.id, t])), [tiersChoix]);
  const tiersParType = useMemo(() => ({ fournisseur: tiersChoix.filter((t) => t.type === 'fournisseur'), client: tiersChoix.filter((t) => t.type === 'client') }), [tiersChoix]);
  // Codes que « Ajouter la retenue » calcule sur l'écriture entière : retenues à la source, retenues de TVA, avances.
  const retenues = useMemo(() => etat.taxes.filter((x) => x.type === 'retenue' || x.type === 'retenue_tva' || x.type === 'avance'), [etat.taxes]);
  const jour = aujourdhui();
  const dateDefaut = exercice ? (periodeDe(exercice.periodes, jour) ? jour : exercice.periodes.filter((p) => p.etat === 'ouverte').pop()?.debut || exercice.fin) : jour;
  const [journalId, setJournalId] = useState<number | null>(ecriture?.journal.id ?? journaux[0]?.id ?? null);
  const [date, setDate] = useState(ecriture?.date || dateDefaut);
  // S6b (NC 01 §61) : la vraie date d'une opération d'une période close, enregistrée au premier jour de la période
  // ouverte suivante ; vide le reste du temps. Les échéances se proposent d'après la vraie date quand elle existe.
  const [dateReelle, setDateReelle] = useState(ecriture?.dateReelle || '');
  const [reference, setReference] = useState(ecriture?.reference || '');
  const [libelle, setLibelle] = useState(ecriture?.libelle || '');
  const [lignes, setLignes] = useState<LigneSaisie[]>(() => (ecriture?.lignes?.length ? ecriture.lignes.map(depuisLigne) : [ligneVide(), ligneVide()]));
  const [retenueId, setRetenueId] = useState<number | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [aide, setAide] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [note, setNote] = useState('');
  // Miroir des lignes pour les aides (lues à la réponse du serveur, jamais depuis une fermeture périmée).
  const lignesRef = useRef(lignes);
  useEffect(() => { lignesRef.current = lignes; }, [lignes]);
  const journal = journaux.find((j) => j.id === journalId) || null;
  const t = totaux(lignes);
  const equilibre = t.ecart === 0n && t.debit > 0n;
  // Une retenue ou une avance déjà posée : le bouton ne la propose pas deux fois.
  const retenueDeja = lignes.some((l) => { const x = l.taxeId ? taxesParId.get(l.taxeId) : null; return !!x && (x.type === 'retenue' || x.type === 'retenue_tva' || x.type === 'avance'); });
  const fige = envoi || aide;
  // La ligne du tiers (compte collectif) : sa retenue par défaut propose le code ; « Ajouter la retenue » part de là.
  const ligneTiers = lignes.find((l) => l.tiersId && typeTiersDe(comptesParId.get(l.compteId ?? -1)?.nature));
  const tiersLigne = ligneTiers ? tiersParId.get(ligneTiers.tiersId ?? -1) || null : null;
  const retenueProposee = retenueId ?? (tiersLigne?.retenue && tiersLigne.retenue.actif ? tiersLigne.retenue.id : null);
  const retenuePossible = !!journal && (journal.type === 'achats' || journal.type === 'ventes') && !!ligneTiers;

  const poser = (cle: number, partie: Partial<LigneSaisie>) => { setLignes((ls) => ls.map((l) => (l.cle === cle ? { ...l, ...partie } : l))); setErreur(null); };
  const changerCompte = (l: LigneSaisie, compteId: number | null) => {
    const type = typeTiersDe(comptesParId.get(compteId ?? -1)?.nature);
    const tiers = l.tiersId ? tiersParId.get(l.tiersId) : null;
    poser(l.cle, { compteId, tiersId: type && tiers && tiers.type === type ? l.tiersId : null });
  };
  // La date de référence des échéances : la vraie date de l'opération quand elle existe, sinon la date d'enregistrement.
  const baseEcheance = dateReelle || date;
  const changerTiers = (l: LigneSaisie, tiers: TiersCourt | null) => {
    // Échéance proposée d'après le délai de paiement du tiers (jamais imposée : le champ reste modifiable) ; le code de
    // retenue choisi pour l'ancien tiers ne suit pas.
    poser(l.cle, { tiersId: tiers?.id ?? null, echeance: tiers && !l.echeance && /^\d{4}-\d{2}-\d{2}$/.test(baseEcheance) ? ajouterJours(baseEcheance, tiers.delaiPaiement) : l.echeance });
    setRetenueId(null);
  };
  // La date (ou la vraie date) change : les échéances encore égales à la proposition (ancienne base + délai du tiers) suivent.
  const suivreEcheances = (ancienne: string, nouvelle: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nouvelle) || !/^\d{4}-\d{2}-\d{2}$/.test(ancienne) || ancienne === nouvelle) return;
    setLignes((ls) => ls.map((l) => {
      const tiers = l.tiersId ? tiersParId.get(l.tiersId) : null;
      return tiers && l.echeance === ajouterJours(ancienne, tiers.delaiPaiement) ? { ...l, echeance: ajouterJours(nouvelle, tiers.delaiPaiement) } : l;
    }));
  };
  const changerDate = (nouvelle: string) => {
    const ancienne = baseEcheance;
    setDate(nouvelle);
    setErreur(null);
    if (!dateReelle) suivreEcheances(ancienne, nouvelle);
  };
  const changerDateReelle = (nouvelle: string) => {
    const ancienne = baseEcheance;
    setDateReelle(nouvelle);
    setErreur(null);
    suivreEcheances(ancienne, nouvelle || date);
  };
  // La date choisie tombe dans une période close : l'écriture s'enregistre au premier jour de la période ouverte suivante,
  // la vraie date gardée (NC 01 §61).
  const reporterDate = (suivante: string) => {
    setDateReelle(dateReelle || date);
    setDate(suivante);
    setErreur(null);
  };
  const retirer = (cle: number) => { setLignes((ls) => (ls.length > 2 ? ls.filter((l) => l.cle !== cle) : ls)); setErreur(null); };
  const ajouter = () => { setLignes((ls) => [...ls, ligneVide()]); setErreur(null); };
  // Une ligne calculée par le serveur, insérée dans la grille (montants en texte français).
  const ligneDepuisAide = (r: AideReponse): LigneSaisie => ({ cle: cleSuivante++, compteId: r.ligne.compteId, tiersId: null, libelle: '', debit: versMillimes(r.ligne.debit) ? fmtMontant(r.ligne.debit) : '', credit: versMillimes(r.ligne.credit) ? fmtMontant(r.ligne.credit) : '', taxeId: r.ligne.taxeId, echeance: '' });
  const erreurAide = (err: unknown, defaut: string) => {
    if (refusPerime(err) && onRefus(err)) return;
    setErreur(messageDossier(err, defaut, role));
  };
  const ajouterTaxe = async (l: LigneSaisie) => {
    if (aide || envoi || !journalId) return;
    const m = controlerMontant(l.debit) || controlerMontant(l.credit);
    if (m) { setErreur(m); return; }
    setAide(true);
    setErreur(null);
    try {
      const r = await aideTaxe(etat.dossier.id, { journalId, ligne: ligneEnvoyee(l) });
      // Insérée sous la ligne de base (en fin de grille si elle a disparu entre-temps).
      setLignes((ls) => { const i = ls.findIndex((x) => x.cle === l.cle); const n = [...ls]; n.splice(i < 0 ? n.length : i + 1, 0, ligneDepuisAide(r)); return n; });
      setNote(`${r.taxe.code} : ${fmtMontant(r.ligne.debit !== '0.000' ? r.ligne.debit : r.ligne.credit)} D sur ${r.compte.numero} (base ${fmtMontant(r.base)} D). Ligne modifiable.`);
    } catch (err) {
      erreurAide(err, 'La ligne de taxe n\'a pas pu être calculée.');
    } finally {
      setAide(false);
    }
  };
  const ajouterRetenue = async () => {
    if (aide || envoi || !journalId || !ligneTiers) return;
    for (const l of lignes) { const m = controlerMontant(l.debit) || controlerMontant(l.credit); if (m) { setErreur(m); return; } }
    setAide(true);
    setErreur(null);
    try {
      const r = await aideRetenue(etat.dossier.id, { journalId, tiersId: ligneTiers.tiersId, taxeId: retenueProposee, lignes: lignes.filter((l) => l.compteId && (versMillimes(l.debit) || versMillimes(l.credit))).map(ligneEnvoyee) });
      const montant = versMillimes(r.ligne.debit !== '0.000' ? r.ligne.debit : r.ligne.credit) ?? 0n;
      const avance = r.taxe.type === 'avance';
      // Les lignes telles qu'elles sont À LA RÉPONSE (miroir), jamais la copie prise au clic.
      const courantes = lignesRef.current;
      let suivantes = [...courantes, ligneDepuisAide(r)];
      // La ligne du tiers passe au net : son montant (crédit à l'achat, débit à la vente) baisse de la retenue (une avance
      // l'augmente) — seulement quand il n'y a qu'une ligne de tiers et que son montant couvre la retenue.
      let net = false;
      const collectifs = courantes.filter((l) => l.tiersId && typeTiersDe(comptesParId.get(l.compteId ?? -1)?.nature));
      if (collectifs.length === 1 && journal) {
        const cote: 'debit' | 'credit' = journal.type === 'achats' ? 'credit' : 'debit';
        const actuel = versMillimes(collectifs[0][cote]);
        if (actuel != null && (avance || actuel > montant)) {
          suivantes = suivantes.map((l) => (l.cle === collectifs[0].cle ? { ...l, [cote]: fmtMontant(avance ? actuel + montant : actuel - montant) } : l));
          net = true;
        }
      }
      setLignes(suivantes);
      const assiette = r.taxe.assiette === 'tva' ? 'assiette : la TVA' : r.taxe.assiette === 'ht' ? 'assiette HT' : 'assiette TTC hors timbre';
      setNote(`${avance ? 'Avance' : 'Retenue'} ${r.taxe.code} : ${fmtMontant(montant)} D sur ${r.compte.numero} (${assiette} ${fmtMontant(r.base)} D)${net ? (avance ? ' ; la ligne du tiers augmente d\'autant' : ' ; la ligne du tiers passe au net') : ''}. Ligne modifiable${avance ? '.' : ' ; retirez-la si la retenue n\'est pas due (seuil par paiement).'}`);
    } catch (err) {
      erreurAide(err, 'La retenue n\'a pas pu être calculée.');
    } finally {
      setAide(false);
    }
  };
  const enregistrer = async () => {
    if (envoi || aide) return;
    if (!journalId) { setErreur('Choisissez le journal.'); return; }
    const ed = controlerDate(date, exercice);
    if (ed) { setErreur(ed); return; }
    if (dateReelle && (!/^\d{4}-\d{2}-\d{2}$/.test(dateReelle) || dateReelle >= date)) { setErreur('La vraie date de l\'opération doit précéder la date d\'enregistrement ; sinon, retirez-la.'); return; }
    if (!reference.trim()) { setErreur('Indiquez la référence de la pièce justificative (numéro de facture, de relevé…).'); return; }
    if (!libelle.trim()) { setErreur('Indiquez le libellé de l\'écriture.'); return; }
    if (lignes.length < 2) { setErreur('Une écriture a au moins deux lignes.'); return; }
    for (const [i, l] of lignes.entries()) {
      const n = i + 1;
      if (!l.compteId) { setErreur(`Ligne ${n} : choisissez le compte.`); return; }
      const m = controlerMontant(l.debit) || controlerMontant(l.credit);
      if (m) { setErreur(`Ligne ${n} : ${m.charAt(0).toLowerCase()}${m.slice(1)}`); return; }
      const d = versMillimes(l.debit) ?? 0n;
      const c = versMillimes(l.credit) ?? 0n;
      if (d > 0n && c > 0n) { setErreur(`Ligne ${n} : un débit ou un crédit, pas les deux.`); return; }
      if (d === 0n && c === 0n) { setErreur(`Ligne ${n} : indiquez le débit ou le crédit.`); return; }
      const type = typeTiersDe(comptesParId.get(l.compteId)?.nature);
      if (type && !l.tiersId) { setErreur(`Ligne ${n} : choisissez le ${type} (compte collectif ${comptesParId.get(l.compteId)?.numero}).`); return; }
      if (l.echeance && l.echeance < baseEcheance) { setErreur(`Ligne ${n} : l'échéance précède la date de l'écriture.`); return; }
    }
    if (!equilibre) { setErreur(`Écriture déséquilibrée : débits ${fmtMontant(t.debit)} ≠ crédits ${fmtMontant(t.credit)} (écart ${fmtMontant(t.ecart < 0n ? -t.ecart : t.ecart)}). Enregistrer n'est possible qu'à écart nul.`); return; }
    setEnvoi(true);
    setErreur(null);
    try {
      const corps = { journalId, date, dateReelle: dateReelle || null, reference: reference.trim(), libelle: libelle.trim(), lignes: lignes.map(ligneEnvoyee) };
      const url = `/api/compta/dossiers/${etat.dossier.id}/ecritures`;
      const { data } = creation ? await api.post(url, corps) : await api.put(`${url}/${ecriture.id}`, corps);
      onEnregistre(data as EcritureReponse);
    } catch (err) {
      if (refusPerime(err) && onRefus(err)) return;
      setErreur(messageDossier(err, `L'écriture n'a pas pu être enregistrée — réessayez.`, role));
      setEnvoi(false);
    }
  };
  const periode = exercice && /^\d{4}-\d{2}-\d{2}$/.test(date) ? periodeDe(exercice.periodes, date) : null;
  const suivante = exercice && periode && periode.etat === 'close' ? periodeOuverteSuivante(exercice.periodes, periode) : null;
  return (
    <Modale titre={creation ? 'Saisir une écriture' : `Modifier l'écriture ${ecriture.numeroProvisoire}`} sousTitre={creation ? 'En brouillard : modifiable et supprimable jusqu\'à sa validation' : `${ecriture.libelle} · ${fmtMontant(ecriture.total)} D`}
      onClose={onClose} onSubmit={enregistrer} envoi={envoi} erreur={erreur} libelleEnvoi={creation ? '✓ Enregistrer en brouillard' : '✓ Enregistrer'} largeur={980}>
      <div style={grille}>
        <div>
          <label htmlFor="fe-f-journal" style={lbl}>Journal</label>
          <select id="fe-f-journal" value={journalId ?? ''} onChange={(e) => { setJournalId(e.target.value ? Number(e.target.value) : null); setErreur(null); }} disabled={envoi} style={inp}>
            {journaux.length === 0 && <option value="">Aucun journal actif</option>}
            {journaux.map((j) => <option key={j.id} value={j.id}>{j.code} — {j.libelle}{j.actif ? '' : ' (désactivé)'}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="fe-f-date" style={lbl}>{dateReelle ? 'Date d\'enregistrement' : 'Date'}</label>
          <input id="fe-f-date" type="date" value={date} min={exercice?.debut} max={exercice?.fin} onChange={(e) => changerDate(e.target.value)} disabled={fige} style={inp} />
          <div style={{ fontSize: '0.72rem', color: periode ? (periode.etat === 'ouverte' ? '#166534' : '#b91c1c') : '#b45309', marginTop: 4 }}>
            {periode ? `Période : ${libellePeriode(periode)}${periode.etat === 'ouverte' ? '' : ' (close)'}` : exercice ? `Hors de l'exercice (${fmtJour(exercice.debut)} → ${fmtJour(exercice.fin)})` : 'Aucun exercice ouvert'}
          </div>
          {periode && periode.etat === 'close' && (
            <div style={{ fontSize: '0.74rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 10px', marginTop: 6, lineHeight: 1.5 }}>
              {suivante
                ? <>Une opération d'une période close s'enregistre au premier jour de la période ouverte suivante, sa vraie date gardée (NC 01 §61). <button type="button" onClick={() => reporterDate(suivante.debut)} disabled={fige} style={{ ...petit('#fff', '#92400e', '#fcd34d'), marginTop: 4 }}>Enregistrer au {fmtJour(suivante.debut)} en gardant la vraie date {fmtJour(date)}</button></>
                : 'Aucune période ouverte ne suit : le titulaire peut rouvrir la période (page Périodes).'}
            </div>
          )}
        </div>
        {dateReelle && (
          <div>
            <label htmlFor="fe-f-reelle" style={lbl}>Vraie date de l'opération</label>
            <input id="fe-f-reelle" type="date" value={dateReelle} max={date} onChange={(e) => changerDateReelle(e.target.value)} disabled={fige} style={inp} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: '#b45309' }}>Opération d'une période close, enregistrée au {fmtJour(date)}.</span>
              <button type="button" onClick={() => changerDateReelle('')} disabled={fige} style={petit('#fff', '#475569', '#cbd5e1')}>✕ Retirer</button>
            </div>
          </div>
        )}
        <div>
          <label htmlFor="fe-f-ref" style={lbl}>Référence de la pièce</label>
          <input id="fe-f-ref" value={reference} onChange={(e) => { setReference(e.target.value); setErreur(null); }} disabled={envoi} maxLength={etat.bornes.referenceMax} placeholder="ex. F-2026-0412" style={{ ...inp, fontFamily: mono }} autoFocus={creation} />
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <label htmlFor="fe-f-libelle" style={lbl}>Libellé</label>
          <input id="fe-f-libelle" value={libelle} onChange={(e) => { setLibelle(e.target.value); setErreur(null); }} disabled={envoi} maxLength={etat.bornes.libelleMax} placeholder="ex. Facture STB boissons" style={inp} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {lignes.map((l, i) => {
          const compte = l.compteId ? comptesParId.get(l.compteId) || null : null;
          const type = typeTiersDe(compte?.nature);
          const taxe = l.taxeId ? taxesParId.get(l.taxeId) || null : null;
          const montantPose = (versMillimes(l.debit) ?? 0n) > 0n || (versMillimes(l.credit) ?? 0n) > 0n;
          // Pas d'aide sur une ligne de TVA (compte de TVA) sauf pour une retenue de TVA ; pas deux fois : la ligne qui
          // suit porte déjà ce code sur un autre compte (sa ligne de taxe est là).
          const ligneDeTva = !!compte && NATURES_TVA.includes(compte.nature);
          const dejaAidee = !!taxe && !!lignes[i + 1] && lignes[i + 1].taxeId === l.taxeId && lignes[i + 1].compteId !== l.compteId;
          const aidePossible = !!taxe && aideTaxePossible(taxe) && montantPose && !dejaAidee && (taxe.assiette === 'tva' ? ligneDeTva : !ligneDeTva);
          return (
            <div key={l.cle} style={carteLigne}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ligne {i + 1}</span>
                <span style={{ flex: 1 }} />
                {aidePossible && taxe && <button type="button" onClick={() => ajouterTaxe(l)} disabled={fige} style={petit('#eef2ff', '#4338ca', '#c7d2fe')}>{aide ? 'Calcul…' : taxe.type === 'tva' ? '➕ Ajouter la TVA' : `➕ Ajouter ${taxe.type === 'timbre' ? 'le timbre' : 'la taxe'}`}</button>}
                <button type="button" onClick={() => retirer(l.cle)} disabled={fige || lignes.length <= 2} title={lignes.length <= 2 ? 'Une écriture garde au moins deux lignes' : 'Retirer cette ligne'} style={{ ...petit('#fff', '#be123c', '#fecdd3'), opacity: lignes.length <= 2 ? 0.5 : 1 }}>✕ Retirer</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: type ? 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))' : '1fr', gap: 12 }}>
                <ChoixCompte id={`fe-l-${l.cle}-compte`} libelle="Compte" comptes={comptesChoix} valeur={l.compteId} onChange={(id) => changerCompte(l, id)} disabled={fige} />
                {type && <ChoixTiers id={`fe-l-${l.cle}-tiers`} libelle={`${type === 'fournisseur' ? 'Fournisseur' : 'Client'} (compte collectif ${compte?.numero})`} tiers={tiersParType[type]} valeur={l.tiersId} onChange={(x) => changerTiers(l, x)} disabled={fige} />}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
                <div style={{ gridColumn: 'span 2' }}>
                  <label htmlFor={`fe-l-${l.cle}-lib`} style={lbl}>Libellé de la ligne</label>
                  <input id={`fe-l-${l.cle}-lib`} value={l.libelle} onChange={(e) => poser(l.cle, { libelle: e.target.value })} disabled={fige} maxLength={etat.bornes.libelleMax} placeholder={libelle.trim() || 'Celui de l\'écriture'} style={inp} />
                </div>
                <div>
                  <label htmlFor={`fe-l-${l.cle}-debit`} style={lbl}>Débit</label>
                  <input id={`fe-l-${l.cle}-debit`} inputMode="decimal" value={l.debit} onChange={(e) => poser(l.cle, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} disabled={fige} placeholder="0,000" style={{ ...inp, fontFamily: mono, textAlign: 'right' }} />
                </div>
                <div>
                  <label htmlFor={`fe-l-${l.cle}-credit`} style={lbl}>Crédit</label>
                  <input id={`fe-l-${l.cle}-credit`} inputMode="decimal" value={l.credit} onChange={(e) => poser(l.cle, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} disabled={fige} placeholder="0,000" style={{ ...inp, fontFamily: mono, textAlign: 'right' }} />
                </div>
                <div>
                  <label htmlFor={`fe-l-${l.cle}-taxe`} style={lbl}>Code de taxe</label>
                  <select id={`fe-l-${l.cle}-taxe`} value={l.taxeId ?? ''} onChange={(e) => poser(l.cle, { taxeId: e.target.value ? Number(e.target.value) : null })} disabled={fige} style={inp}>
                    <option value="">Aucun</option>
                    {etat.taxes.map((x) => <option key={x.id} value={x.id}>{texteTaxe(x)}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`fe-l-${l.cle}-ech`} style={lbl}>Échéance</label>
                  <input id={`fe-l-${l.cle}-ech`} type="date" value={l.echeance} min={baseEcheance} onChange={(e) => poser(l.cle, { echeance: e.target.value })} disabled={fige} style={inp} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
        <button type="button" onClick={ajouter} disabled={fige || lignes.length >= etat.bornes.lignesMax} style={petit('#fff', '#4338ca', '#c7d2fe')}>+ Ligne</button>
        {retenuePossible && !retenueDeja && (
          <>
            <select aria-label="Code de retenue à la source, de retenue de TVA ou d'avance" value={retenueProposee ?? ''} onChange={(e) => { setRetenueId(e.target.value ? Number(e.target.value) : null); setErreur(null); }} disabled={fige} style={{ ...inp, width: 'auto', minWidth: 160 }}>
              <option value="">Code de retenue…</option>
              {retenues.map((x) => <option key={x.id} value={x.id}>{texteTaxe(x)}{tiersLigne?.retenue?.id === x.id ? (tiersLigne.retenue.selonRegime ? " — d'après le régime" : ' — par défaut') : ''}</option>)}
            </select>
            <button type="button" onClick={ajouterRetenue} disabled={fige || !retenueProposee} style={petit('#eef2ff', '#4338ca', '#c7d2fe')}>{aide ? 'Calcul…' : '➕ Ajouter la retenue'}</button>
          </>
        )}
        <span style={{ flex: 1 }} />
        <span role="status" style={{ fontFamily: mono, fontSize: '0.84rem', fontWeight: 800, color: equilibre ? '#166534' : '#b45309', background: equilibre ? '#f0fdf4' : '#fffbeb', border: `1px solid ${equilibre ? '#bbf7d0' : '#fde68a'}`, borderRadius: 10, padding: '8px 12px' }}>
          Débits {fmtMontant(t.debit)} · Crédits {fmtMontant(t.credit)} · Écart {fmtMontant(t.ecart < 0n ? -t.ecart : t.ecart)}{equilibre ? ' ✓' : ''}
        </span>
      </div>
      {note && <div role="status" style={{ marginTop: 10, fontSize: '0.78rem', color: '#3730a3', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 8, padding: '8px 12px' }}>{note}</div>}
      <p style={{ margin: '10px 0 0', fontSize: '0.76rem', color: '#64748b', lineHeight: 1.5 }}>
        Comptes imputables seulement (actifs, sans sous-compte actif) ; un tiers sur un compte collectif ; un débit ou un crédit par ligne, en dinars à trois décimales ; l'échéance est proposée d'après le délai de paiement du tiers. La date de traitement est celle du serveur.
      </p>
    </Modale>
  );
}

const grille: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 };
const listeAide: React.CSSProperties = { margin: 0, paddingLeft: 18, display: 'grid', gap: 4 };
const carteLigne: React.CSSProperties = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 14px' };
const cadre: React.CSSProperties = { background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' };
const enTeteCadre: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 18px', background: 'linear-gradient(135deg,#f8faff,#eef2ff)', flexWrap: 'wrap' };
const cellule: React.CSSProperties = { padding: '5px 8px' };
const lien: React.CSSProperties = { border: 'none', background: 'none', cursor: 'pointer', color: '#4338ca', fontWeight: 700, fontSize: '0.74rem', padding: '2px 4px', fontFamily: 'inherit' };
const alerte: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 12, padding: '14px 18px', fontWeight: 600, fontSize: '0.86rem' };
