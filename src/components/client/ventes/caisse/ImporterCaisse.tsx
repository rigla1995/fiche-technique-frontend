// Import d'un fichier de caisse (étapes V1a et V1b — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §3 et §5 bis) :
// la fenêtre « Importer la caisse » de la saisie des ventes. On dépose l'export de la caisse (Excel, PDF ou CSV) ;
// LabFlow le lit dans le navigateur, puis l'utilisateur VÉRIFIE chaque ligne : le produit de la carte auquel elle
// correspond (appris pour les fois suivantes) et sa quantité par canal. Décisions du client (18/11/2026) : la part de
// chaque prestataire est saisie, le reste est de la vente directe ; dans une catégorie de livraison, seuls les
// prestataires. Le serveur revérifie tout et crée les ventes de la journée, une par canal, avec les règles de la saisie.
// V1b :
//   • TOUT fichier : si ses colonnes ne se reconnaissent pas seules, un modèle retenu s'applique, sinon l'utilisateur
//     les désigne (DesignerColonnes) et LabFlow s'en souvient ;
//   • plusieurs fichiers déposés d'un coup, un par journée, vérifiés l'un après l'autre ;
//   • une journée déjà importée se REMPLACE (ses ventes sont effacées, leur stock rendu) ; les ventes saisies à la
//     main le même jour sont signalées ; les journées importées se consultent et s'annulent (JourneesImportees) ;
//   • le document d'origine est conservé avec l'import.
// Lecture : lireCaisse.ts, lireCsv.ts, ouvrirFichier.ts ; logique de la fenêtre : importCaisse.ts (pures, testées).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../../api/client';
import { useConfirm } from '../../../common/ConfirmDialog';
import { useVocabulaire } from '../../../../hooks/useVocabulaire';
import { ouvertALaSaisie } from '../canaux';
import type { PrixPrestataire } from '../canaux';
import { jourDuFichier, jourDuNom, lireFeuilleDesignee, trouverModele } from './lireCaisse';
import type { ColonnesDesignees, LectureCaisse, ModeleAppris } from './lireCaisse';
import { FichierIllisible, ouvrirFichierCaisse } from './ouvrirFichier';
import type { FichierCaisse } from './ouvrirFichier';
import {
  CANAL_DIRECT, bilan, cleCategorie, cleProduit, corpsImport, livraisonProposee, proposerProduit, repartir,
} from './importCaisse';
import type { CategorieApprise, CorrespondanceApprise, EtatLigne, LigneVerifiee, ProduitCarte } from './importCaisse';
import DesignerColonnes from './DesignerColonnes';
import JourneesImportees from './JourneesImportees';
import type { ImportJournee } from './JourneesImportees';

const C = '#b45309';
const CD = '#78350f';
const CL = '#fffbeb';
const CB = '#fcd34d';
const ROUGE = '#b91c1c';
const FICHIERS_MAX = 31;

const apiMsg = (e: unknown, defaut: string) => (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? defaut;
const dt = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} DT`;
const qte = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
const jourFr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dateValide = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

/** Ce que la saisie des ventes connaît déjà de l'activité : sa carte, ses prestataires, ses prix par canal. */
export interface ArticleCarte { id: string; article_type: 'produit' | 'ingredient'; article_id: number; nom: string; prix_vente: number; actif: boolean; directe?: boolean }
export interface PrestataireCarte { id: string; prestataire_nom: string; conditions_renseignees?: boolean }
interface Props {
  activiteId: number;
  activiteNom: string;
  articles: readonly ArticleCarte[];
  prestataires: readonly PrestataireCarte[];
  prixPrestataires: readonly PrixPrestataire[];
  /** Compte connecté : un gérant ne remplace et n'annule que ses propres imports. */
  utilisateur?: { id?: number; role?: string } | null;
  onFermer: () => void;
  onImporte: () => void;
}

interface Contexte { correspondances: Map<string, CorrespondanceApprise>; categories: Map<string, CategorieApprise>; modeles: ModeleAppris[] }
interface Choix { produit: string | null; etat: EtatLigne | 'choisie'; ignoree: boolean; saisies: Record<string, string> }
/** Le fichier en cours. `lecture` nulle : ses colonnes sont à désigner. `origine` : d'où viennent ses colonnes. */
interface Courant {
  brut: File; ouvert: FichierCaisse; lecture: LectureCaisse | null; modele: ModeleAppris | null;
  origine: 'titres' | 'modele' | 'designees'; propose: ColonnesDesignees | null;
}
interface EtatJour { date: string; import: ImportJournee | null; saisies: { nombre: number; total: number } }
interface Fait { nom: string; date: string; total: number; lignes: number; canaux: string; remplace: boolean; documentGarde: boolean }

export default function ImporterCaisse({ activiteId, activiteNom, articles, prestataires, prixPrestataires, utilisateur = null, onFermer, onImporte }: Props) {
  const voc = useVocabulaire();
  const { alerte } = useConfirm();
  const champ = useRef<HTMLInputElement>(null);
  const [contexte, setContexte] = useState<Contexte | null>(null);
  const [file, setFile] = useState<File[]>([]);
  const [rang, setRang] = useState(0);
  const [courant, setCourant] = useState<Courant | null>(null);
  const [illisible, setIllisible] = useState<string | null>(null);
  const [lecture, setLecture] = useState(false);
  const [erreur, setErreur] = useState('');
  const [date, setDate] = useState('');
  const [origineDate, setOrigineDate] = useState<'fichier' | 'nom' | ''>('');
  const [livraisons, setLivraisons] = useState<Record<string, boolean>>({});
  const [choix, setChoix] = useState<Record<number, Choix>>({});
  const [jourLu, setJourLu] = useState<{ cle: string; etat: EtatJour } | null>(null);
  const [remplacerPour, setRemplacerPour] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [faits, setFaits] = useState<Fait[]>([]);
  const [versionListe, setVersionListe] = useState(0);

  // Seuls les prestataires dont les conditions sont renseignées reçoivent des ventes (la saisie les refuse aussi).
  const prets = useMemo(() => prestataires.filter((p) => p.conditions_renseignees !== false), [prestataires]);
  const liens = useMemo(() => prets.map((p) => p.id), [prets]);
  const carte = useMemo<ProduitCarte[]>(() => articles
    .map((a) => ({
      cle: cleProduit(a.article_type, a.article_id), articleType: a.article_type, articleId: a.article_id, nom: a.nom,
      canaux: [CANAL_DIRECT, ...liens].filter((canal) => ouvertALaSaisie(a, prixPrestataires, canal)),
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')), [articles, liens, prixPrestataires]);

  const lireContexte = useCallback(async (): Promise<Contexte> => {
    const { data } = await api.get(`/api/ventes/imports/contexte?activiteId=${activiteId}`);
    const d = data as { correspondances: CorrespondanceApprise[]; categories: CategorieApprise[]; modeles?: ModeleAppris[] };
    return { correspondances: new Map(d.correspondances.map((c) => [c.cle, c])), categories: new Map(d.categories.map((c) => [c.cle, c])), modeles: d.modeles ?? [] };
  }, [activiteId]);
  useEffect(() => {
    let vivant = true;
    lireContexte().then((c) => { if (vivant) setContexte(c); }).catch((e: unknown) => { if (vivant) setErreur(apiMsg(e, 'Chargement impossible.')); });
    return () => { vivant = false; };
  }, [lireContexte]);

  // Ce qui existe déjà pour la journée choisie : son import (à remplacer) et les ventes saisies à la main.
  // L'état lu vaut pour CE fichier, CETTE date et ce qui a déjà été importé dans la fenêtre (`cleJour`).
  const lu = courant?.lecture ?? null;
  const cleJour = courant && lu && dateValide(date) ? `${courant.ouvert.empreinte}|${date}|${faits.length}` : '';
  useEffect(() => {
    if (!cleJour) return undefined;
    let vivant = true;
    api.get(`/api/ventes/imports/jour?activiteId=${activiteId}&date=${date}`)
      .then(({ data }) => { if (vivant) setJourLu({ cle: cleJour, etat: data as EtatJour }); })
      .catch((e: unknown) => { if (vivant) setErreur(apiMsg(e, 'Vérification de la journée impossible.')); });
    return () => { vivant = false; };
  }, [activiteId, date, cleJour]);
  const etatJour = jourLu && jourLu.cle === cleJour ? jourLu.etat : null;
  const remplacer = remplacerPour !== '' && remplacerPour === cleJour;

  const voulus = (livraison: boolean) => (livraison ? liens : [CANAL_DIRECT]);
  const messageIllisible = (e: unknown): string => {
    const raison = e instanceof FichierIllisible ? e.raison : 'ILLISIBLE';
    if (raison === 'XLS') return 'Ancien format Excel (.xls) : enregistrez le fichier en .xlsx, ou exportez-le en CSV ou en PDF.';
    if (raison === 'FORMAT') return 'Type de fichier non lu : un export Excel (.xlsx), CSV ou PDF de la caisse est attendu.';
    if (raison === 'TROP_GROS') return 'Fichier trop lourd (15 Mo au plus).';
    if (raison === 'PDF_IMAGE') return 'Ce PDF est une image (un ticket numérisé) : il ne contient pas de texte à lire. Exportez le fichier depuis la caisse, en Excel, en CSV ou en PDF.';
    if (raison === 'SANS_TABLEAU') return `Aucun tableau n'a été trouvé dans ce fichier : il doit détailler ${voc.le('vente', true)} par ${voc.nom('produit')}, avec une désignation, une quantité et un montant.`;
    return 'Fichier illisible (abîmé ou protégé).';
  };

  /** Prépare la vérification d'une lecture : nature des catégories, produit de chaque ligne, journée. Rend un refus. */
  const presenter = (lecture0: LectureCaisse, nom: string, ctx: Contexte): string | null => {
    const jour = jourDuFichier(lecture0);
    if (jour.etat === 'plusieurs') {
      return `Ce fichier porte du chiffre sur ${jour.jours.length} jours (${jour.jours.map(jourFr).join(', ')}). Un import vaut une journée : exportez un fichier par jour.`;
    }
    const nature: Record<string, boolean> = {};
    for (const categorie of lecture0.categories) {
      const cle = cleCategorie(categorie);
      nature[cle] = ctx.categories.get(cle)?.livraison ?? livraisonProposee(categorie, prets.map((p) => p.prestataire_nom));
    }
    const premiers: Record<number, Choix> = {};
    for (const l of lecture0.lignes) {
      const p = proposerProduit(l, carte, ctx.correspondances, voulus(l.categorie ? nature[cleCategorie(l.categorie)] === true : false));
      premiers[l.rang] = { produit: p.produit, etat: p.etat, ignoree: false, saisies: {} };
    }
    const duNom = jour.date ? null : jourDuNom(nom);
    setDate(jour.date ?? duNom ?? '');
    setOrigineDate(jour.date ? 'fichier' : duNom ? 'nom' : '');
    setLivraisons(nature);
    setChoix(premiers);
    return null;
  };

  /** Ouvre le fichier `n` de la liste : lu par ses titres, par un modèle retenu, ou colonnes à désigner. */
  const ouvrirRang = async (liste: readonly File[], n: number, ctx: Contexte) => {
    setRang(n);
    setCourant(null);
    setIllisible(null);
    setErreur('');
    setLecture(true);
    try {
      const brut = liste[n];
      const ouvert = await ouvrirFichierCaisse(brut);
      let suite: Courant = { brut, ouvert, lecture: ouvert.lecture, modele: null, origine: 'titres', propose: null };
      if (!ouvert.lecture) {
        suite = { ...suite, origine: 'designees', propose: trouverModele(ouvert.feuilles[0].lignes, ctx.modeles)?.modele.colonnes ?? null };
        for (const feuille of ouvert.feuilles) {
          const trouve = trouverModele(feuille.lignes, ctx.modeles);
          const lecture0 = trouve?.sur ? lireFeuilleDesignee(feuille.lignes, trouve.modele.colonnes) : null;
          if (trouve && lecture0) { suite = { ...suite, lecture: lecture0, modele: trouve.modele, origine: 'modele' }; break; }
        }
      }
      const refus = suite.lecture ? presenter(suite.lecture, ouvert.nom, ctx) : null;
      if (refus) setIllisible(refus); else setCourant(suite);
    } catch (e: unknown) {
      setIllisible(messageIllisible(e));
    } finally {
      setLecture(false);
      if (champ.current) champ.current.value = '';
    }
  };

  const choisir = (fichiers: FileList | null) => {
    if (!fichiers?.length || !contexte) return;
    // Par nom : des fichiers nommés par leur date se présentent dans l'ordre des journées.
    const liste = Array.from(fichiers).sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true })).slice(0, FICHIERS_MAX);
    setFile(liste);
    setFaits([]);
    void ouvrirRang(liste, 0, contexte);
  };

  const resume = async (liste: readonly Fait[]) => {
    if (!liste.length) return;
    const sansDocument = liste.filter((f) => !f.documentGarde).length;
    const note = sansDocument ? ` ${sansDocument > 1 ? 'Des documents n\'ont' : 'Le document n\'a'} pas pu être ${sansDocument > 1 ? 'conservés' : 'conservé'} ; ${voc.le('vente', true)} sont bien ${voc.acc('vente', 'enregistré', 'enregistrée', true)}.` : '';
    if (liste.length === 1) {
      const f = liste[0];
      await alerte({
        title: `Journée du ${jourFr(f.date)} ${f.remplace ? 'remplacée' : 'importée'}`,
        message: `${f.lignes} ligne${f.lignes > 1 ? 's' : ''}, ${dt(f.total)} : ${f.canaux}.${f.remplace ? ` ${voc.Le('vente', true)} de l'import précédent ont été ${voc.acc('vente', 'effacé', 'effacée', true)} et leur ${voc.nom('stock')} rendu.` : ''}${note}`,
        tone: 'info',
      });
      return;
    }
    await alerte({
      title: `${liste.length} journées importées`,
      message: `${dt(liste.reduce((s, f) => s + f.total, 0))} au total.${note}`,
      details: liste.map((f) => `${jourFr(f.date)} — ${f.lignes} ligne${f.lignes > 1 ? 's' : ''}, ${dt(f.total)}${f.remplace ? ' (remplace l\'import précédent)' : ''} · ${f.nom}`),
      tone: 'info',
    });
  };

  /** Passe au fichier suivant de la liste ; au dernier, ferme la fenêtre (avec le bilan) ou revient au dépôt. */
  const suivant = async (liste: readonly Fait[], ctx: Contexte) => {
    if (rang + 1 < file.length) { await ouvrirRang(file, rang + 1, ctx); return; }
    if (liste.length) { onFermer(); await resume(liste); return; }
    setFile([]);
    setCourant(null);
    setIllisible(null);
    setErreur('');
  };

  const estLivraison = (categorie: string | null) => (categorie ? livraisons[cleCategorie(categorie)] === true : false);
  const lignes: LigneVerifiee[] = (lu?.lignes ?? []).map((ligne) => {
    const c = choix[ligne.rang];
    const produit = carte.find((p) => p.cle === c?.produit) ?? null;
    return { ligne, ignoree: c?.ignoree === true, produit, repartition: repartir(ligne.quantite, c?.saisies ?? {}, estLivraison(ligne.categorie), liens, produit ? produit.canaux : null) };
  });
  const b = bilan(lignes);
  const dejaImporte = etatJour?.import ?? null;
  const peutRemplacer = !dejaImporte || utilisateur?.role !== 'gerant' || dejaImporte.created_by === utilisateur?.id;
  const sommesFausses = lu ? lu.controles.filter((x) => !x.juste) : [];
  const pret = b.pret && dateValide(date) && etatJour !== null && (!dejaImporte || (remplacer && peutRemplacer)) && !envoi;
  const plusieurs = file.length > 1;
  const reste = file.length - rang - 1;

  const modifier = (r: number, plus: Partial<Choix>) => setChoix((avant) => ({ ...avant, [r]: { ...avant[r], ...plus } }));
  // Changer la nature d'une catégorie : les parts saisies de ses lignes repartent de zéro ; une ligne dont le produit
  // n'a pas été choisi à la main est proposée à nouveau (la variante de livraison, ou le plat sur place).
  const basculerLivraison = (nom: string, livraison: boolean) => {
    if (!lu || !contexte) return;
    setLivraisons((avant) => ({ ...avant, [cleCategorie(nom)]: livraison }));
    setChoix((avant) => {
      const suite = { ...avant };
      for (const l of lu.lignes) {
        if (l.categorie !== nom) continue;
        const c = suite[l.rang];
        const p = c.etat === 'choisie' || c.etat === 'reconnue' ? { produit: c.produit, etat: c.etat } : proposerProduit(l, carte, contexte.correspondances, voulus(livraison));
        suite[l.rang] = { ...c, ...p, saisies: {} };
      }
      return suite;
    });
  };

  const nomCanal = (canal: string) => (canal === CANAL_DIRECT
    ? `${voc.Nom('vente')} ${voc.acc('vente', 'direct', 'directe')}`
    : prets.find((p) => p.id === canal)?.prestataire_nom ?? voc.Nom('prestataire'));

  const enregistrer = async () => {
    if (!courant || !lu || !pret || !contexte) return;
    setEnvoi(true);
    setErreur('');
    try {
      const corps = corpsImport({
        activiteId, date, source: courant.ouvert.source, fichierNom: courant.ouvert.nom, empreinte: courant.ouvert.empreinte, modele: lu.modele, totalLu: lu.totalLu,
        categories: lu.categories.map((nom) => ({ nom, livraison: livraisons[cleCategorie(nom)] === true })), lignes,
        remplacer: Boolean(dejaImporte) && remplacer, colonnes: courant.origine === 'titres' ? null : courant.modele,
      });
      const { data } = await api.post('/api/ventes/imports', corps);
      const r = data as { import: { id: number; total_enregistre: number; nb_lignes: number }; ventes: { canal: string; total: number }[]; remplace: { id: number } | null };
      // Le document d'origine est conservé avec l'import ; un échec ici ne remet pas en cause les ventes enregistrées.
      let documentGarde = true;
      try {
        await api.post(`/api/ventes/imports/${r.import.id}/document`, courant.brut, { headers: { 'Content-Type': 'application/octet-stream' } });
      } catch {
        documentGarde = false;
      }
      const liste = [...faits, {
        nom: courant.ouvert.nom, date, total: r.import.total_enregistre, lignes: r.import.nb_lignes, remplace: Boolean(r.remplace), documentGarde,
        canaux: r.ventes.map((v) => `${nomCanal(v.canal)} ${dt(v.total)}`).join(' · '),
      }];
      setFaits(liste);
      setVersionListe((n) => n + 1);
      onImporte();
      // Ce qui vient d'être appris (lignes, catégories, modèle) sert au fichier suivant.
      const ctx = await lireContexte().catch(() => contexte);
      setContexte(ctx);
      await suivant(liste, ctx);
    } catch (e: unknown) {
      setErreur(apiMsg(e, 'Enregistrement impossible.'));
    } finally {
      setEnvoi(false);
    }
  };

  const passer = () => { if (contexte) void suivant(faits, contexte); };
  const libellePasser = reste > 0 ? 'Passer ce fichier' : plusieurs ? (faits.length ? 'Terminer' : 'Abandonner') : 'Changer de fichier';

  const messageRepartition = (l: LigneVerifiee): string | null => {
    const r = l.repartition;
    if (!r.erreur) return null;
    if (r.erreur === 'SAISIE') return 'Quantité à corriger : un nombre, trois décimales au plus.';
    if (r.erreur === 'TROP') return `Réparti ${qte(l.ligne.quantite - r.reste)} pour ${qte(l.ligne.quantite)} dans le fichier.`;
    if (r.erreur === 'RESTE') return `Reste ${qte(r.reste)} à répartir entre ${voc.le('prestataire', true)}.`;
    if (r.erreur === 'SANS_PRESTATAIRE') return `Catégorie de livraison : activez d'abord ${voc.un('prestataire')} pour ${voc.ce('activite')}, ou décochez « Livraison ».`;
    if (r.erreur === 'PAS_CHEZ_PRESTATAIRE') return `Pas en ${voc.nom('vente')} chez ${voc.un('prestataire')} : cochez la case dans Configuration ${voc.Court('vente')}, ou choisissez la variante de livraison.`;
    return `Pas en ${voc.nom('vente')} sur ${r.horsCanal.map(nomCanal).join(', ')} : cochez la case dans Configuration ${voc.Court('vente')}, ou changez la répartition.`;
  };

  const groupes: { nom: string | null; lignes: LigneVerifiee[] }[] = [];
  for (const l of lignes) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.nom === l.ligne.categorie) dernier.lignes.push(l); else groupes.push({ nom: l.ligne.categorie, lignes: [l] });
  }
  const BADGES: Record<Choix['etat'], { texte: string; fond: string; couleur: string; aide: string }> = {
    reconnue: { texte: '✓ Reconnue', fond: '#dcfce7', couleur: '#166534', aide: 'Déjà apprise lors d\'un import précédent' },
    proposee: { texte: '≈ Proposée', fond: '#e0f2fe', couleur: '#075985', aide: 'Proposée d\'après le nom : vérifiez' },
    a_choisir: { texte: '? À choisir', fond: '#fee2e2', couleur: ROUGE, aide: 'Choisissez ce qui a été vendu, ou ignorez la ligne' },
    choisie: { texte: '✎ Choisie', fond: CL, couleur: CD, aide: 'Choisie à la main' },
  };
  const cellule = { padding: '7px 10px', borderBottom: `1px solid ${CB}`, fontSize: '0.83rem', verticalAlign: 'top' as const };
  const titreCol = { ...cellule, fontSize: '0.7rem', fontWeight: 800, color: CD, textTransform: 'uppercase' as const, background: CL, whiteSpace: 'nowrap' as const, position: 'sticky' as const, top: 0, zIndex: 1 };
  const boutonSecond = { padding: '9px 16px', borderRadius: 10, border: `1.5px solid ${CB}`, background: '#fff', color: CD, fontWeight: 700, cursor: 'pointer', fontSize: '0.86rem' };
  const avis = { background: '#fffbeb', border: `1px solid ${CB}`, color: '#92400e', borderRadius: 10, padding: '9px 13px', marginBottom: 10, fontSize: '0.82rem' };
  const depot = file.length === 0;
  const large = Boolean(courant);

  return (
    <div role="dialog" aria-modal="true" aria-label="Importer la caisse"
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: large ? 1180 : 760, boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '18px 22px', borderBottom: `1px solid ${CB}` }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: CD }}>📥 Importer la caisse — {activiteNom}</h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748b' }}>
              {plusieurs && <strong style={{ color: CD }}>Fichier {rang + 1} sur {file.length} · </strong>}
              {lu
                ? `Vérifiez chaque ligne, puis enregistrez : LabFlow crée ${voc.le('vente', true)} de la journée et retient vos choix.`
                : courant
                  ? 'Indiquez ce que contient chaque colonne : LabFlow le retiendra pour cette caisse.'
                  : `Déposez l'export de la caisse : LabFlow y lit ${voc.le('vente', true)} de la journée, sans rien envoyer ailleurs.`}
            </p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" style={{ border: 'none', background: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
        </div>

        <div style={{ padding: '18px 22px' }}>
          {erreur && (
            <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: ROUGE, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: '0.85rem', fontWeight: 600 }}>{erreur}</div>
          )}
          {faits.length > 0 && (
            <div role="status" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 10, padding: '9px 13px', marginBottom: 12, fontSize: '0.82rem', fontWeight: 600 }}>
              ✓ {faits.map((f) => `${jourFr(f.date)} ${f.remplace ? 'remplacée' : 'importée'} (${dt(f.total)})`).join(' · ')}
            </div>
          )}

          {depot && (
            <div>
              <label style={{ display: 'block', border: `2px dashed ${CB}`, borderRadius: 14, padding: '30px 20px', textAlign: 'center', background: CL, cursor: contexte && !lecture ? 'pointer' : 'wait' }}>
                <input ref={champ} type="file" multiple accept=".xlsx,.pdf,.csv,.txt" disabled={!contexte || lecture} onChange={(e) => choisir(e.target.files)} style={{ display: 'none' }} />
                <div style={{ fontSize: '2rem', marginBottom: 6 }}>📄</div>
                <div style={{ fontWeight: 800, color: CD, fontSize: '0.98rem' }}>{contexte ? 'Choisir le ou les fichiers de la caisse' : 'Chargement…'}</div>
                <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: 6 }}>Excel (.xlsx), CSV ou PDF exporté de la caisse · un fichier par journée, plusieurs fichiers à la fois si vous voulez</div>
              </label>
              <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '12px 2px 0' }}>
                Le fichier doit détailler {voc.le('vente', true)} par {voc.nom('produit')} : désignation, quantité et montant. Colonnes non reconnues : LabFlow vous les demande une fois, puis s'en souvient.
              </p>
              <JourneesImportees activiteId={activiteId} version={versionListe} utilisateur={utilisateur}
                onAnnule={() => { onImporte(); lireContexte().then(setContexte).catch(() => undefined); }} />
            </div>
          )}

          {!depot && lecture && (
            <div role="status" style={{ padding: '34px 20px', textAlign: 'center', color: CD, fontWeight: 800 }}>Lecture de {file[rang]?.name ?? 'fichier'}…</div>
          )}

          {!depot && !lecture && illisible && (
            <div>
              <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: ROUGE, borderRadius: 10, padding: '12px 14px', fontSize: '0.86rem', fontWeight: 600 }}>
                <div style={{ color: CD, marginBottom: 4 }}>📄 {file[rang]?.name}</div>
                {illisible}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                <button type="button" onClick={passer} style={boutonSecond}>{reste > 0 ? 'Fichier suivant' : plusieurs && faits.length ? 'Terminer' : 'Choisir un autre fichier'}</button>
              </div>
            </div>
          )}

          {!lecture && !illisible && courant && !lu && contexte && (
            <DesignerColonnes key={`${rang}-${courant.ouvert.empreinte}`} nomFichier={courant.ouvert.nom} feuilles={courant.ouvert.feuilles} initial={courant.propose}
              libelleAnnuler={libellePasser} onAnnuler={passer}
              onValider={(lecture0, modele) => {
                const refus = presenter(lecture0, courant.ouvert.nom, contexte);
                if (refus) setIllisible(refus); else setCourant({ ...courant, lecture: lecture0, modele, origine: 'designees' });
              }} />
          )}

          {!lecture && !illisible && courant && lu && (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: '0.82rem', color: '#475569' }}>📄 <strong>{courant.ouvert.nom}</strong> · {lu.lignes.length} lignes</span>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: CD, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  Journée
                  <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setOrigineDate(''); }}
                    style={{ padding: '5px 8px', borderRadius: 8, border: `1.5px solid ${date && (!dejaImporte || remplacer) ? CB : ROUGE}`, fontSize: '0.84rem', color: CD }} />
                </label>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: sommesFausses.length ? ROUGE : '#166534' }}>
                  {lu.controles.length === 0
                    ? 'Le fichier n\'imprime pas de total à contrôler'
                    : sommesFausses.length
                      ? `⚠ ${sommesFausses.length} somme${sommesFausses.length > 1 ? 's' : ''} du fichier ne ${sommesFausses.length > 1 ? 'tombent' : 'tombe'} pas juste : ${sommesFausses.map((x) => x.quoi).join(', ')}`
                      : `✓ Sommes du fichier vérifiées (${lu.controles.length} sur ${lu.controles.length})`}
                </span>
              </div>
              {courant.origine !== 'titres' && (
                <div style={{ fontSize: '0.8rem', color: '#475569', marginBottom: 10 }}>
                  {courant.origine === 'modele' ? 'Colonnes reconnues d\'après le modèle retenu pour cette caisse.' : 'Colonnes désignées : LabFlow les retiendra à l\'enregistrement.'}{' '}
                  <button type="button" onClick={() => setCourant({ ...courant, lecture: null, propose: courant.modele?.colonnes ?? null })}
                    style={{ border: 'none', background: 'none', color: C, fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem', padding: 0 }}>
                    Modifier les colonnes
                  </button>
                </div>
              )}
              {!date && <div style={{ color: ROUGE, fontSize: '0.8rem', fontWeight: 600, marginBottom: 10 }}>Le fichier n'annonce pas sa journée : indiquez-la.</div>}
              {date && origineDate === 'nom' && <div style={{ color: '#92400e', fontSize: '0.8rem', fontWeight: 600, marginBottom: 10 }}>Journée proposée d'après le nom du fichier : vérifiez-la.</div>}
              {date && origineDate === 'fichier' && courant.origine !== 'titres' && <div style={{ color: '#92400e', fontSize: '0.8rem', fontWeight: 600, marginBottom: 10 }}>Journée lue dans le fichier : vérifiez-la.</div>}
              {dejaImporte && (
                <div role="alert" style={avis}>
                  <strong>La journée du {jourFr(date)} a déjà été importée</strong> ({dejaImporte.fichier_nom ?? 'fichier sans nom'}, {dt(dejaImporte.total_enregistre)}{dejaImporte.auteur ? `, par ${dejaImporte.auteur}` : ''}).
                  {peutRemplacer ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontWeight: 700, color: CD, cursor: 'pointer' }}>
                      <input type="checkbox" checked={remplacer} onChange={(e) => setRemplacerPour(e.target.checked ? cleJour : '')} style={{ accentColor: C, width: 16, height: 16 }} />
                      Remplacer cet import : {voc.son('vente', true)} ({dejaImporte.ventes}) seront {voc.acc('vente', 'effacé', 'effacée', true)} et leur {voc.nom('stock')} rendu
                    </label>
                  ) : (
                    <div style={{ marginTop: 4, fontWeight: 700 }}>Cette journée a été importée par un autre utilisateur : vous ne pouvez pas la remplacer.</div>
                  )}
                </div>
              )}
              {etatJour && etatJour.saisies.nombre > 0 && (
                <div role="status" style={avis}>
                  ⚠ <strong>{voc.n('vente', etatJour.saisies.nombre)} {voc.acc('vente', 'saisi', 'saisie', etatJour.saisies.nombre)} à la main le {jourFr(date)}</strong> ({dt(etatJour.saisies.total)}) :
                  {' '}ce chiffre s'ajoute au chiffre du fichier. Si la caisse compte déjà ces saisies, supprimez-les dans l'historique : sinon ce chiffre serait compté deux fois.
                </div>
              )}
              {prets.length < prestataires.length && (
                <div style={{ color: '#92400e', fontSize: '0.78rem', marginBottom: 10 }}>
                  ⚠ {voc.Un('prestataire')} {voc.acc('prestataire', 'activé', 'activée')} sans conditions n'est pas {voc.acc('prestataire', 'proposé', 'proposée')} ici : renseignez sa commission dans Config {voc.Court('prestataire', true)}.
                </div>
              )}

              <div style={{ border: `1px solid ${CB}`, borderRadius: 12, overflow: 'auto', maxHeight: '56vh' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...titreCol, textAlign: 'left' }}>Ligne du fichier</th>
                      <th style={{ ...titreCol, textAlign: 'right' }}>Qté</th>
                      <th style={{ ...titreCol, textAlign: 'right' }}>Montant</th>
                      <th style={{ ...titreCol, textAlign: 'left', minWidth: 230 }}>{voc.Nom('produit')} de la carte</th>
                      <th style={{ ...titreCol, textAlign: 'center' }}>🏪 {voc.Nom('vente')} {voc.acc('vente', 'direct', 'directe')}</th>
                      {prets.map((p) => <th key={p.id} style={{ ...titreCol, textAlign: 'center' }}>🛵 {p.prestataire_nom}</th>)}
                      <th style={{ ...titreCol, textAlign: 'center' }}>Ignorer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupes.map((g, gi) => {
                      const livraison = estLivraison(g.nom);
                      return [
                        g.nom !== null && (
                          <tr key={`c${gi}`}>
                            <td colSpan={6 + prets.length} style={{ ...cellule, background: '#fffdf7', fontWeight: 800, color: CD }}>
                              <span style={{ marginRight: 14 }}>🏷️ {g.nom}</span>
                              <label style={{ fontWeight: 600, fontSize: '0.8rem', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                <input type="checkbox" checked={livraison} onChange={(e) => basculerLivraison(g.nom as string, e.target.checked)} style={{ accentColor: C, width: 15, height: 15 }} />
                                Livraison : {voc.le('prestataire', true)} seulement, rien en {voc.nom('vente')} {voc.acc('vente', 'direct', 'directe')}
                              </label>
                            </td>
                          </tr>
                        ),
                        ...g.lignes.map((l) => {
                          const c = choix[l.ligne.rang];
                          const r = l.repartition;
                          const message = l.ignoree ? null : !l.produit ? null : messageRepartition(l);
                          const badge = BADGES[c.etat];
                          return (
                            <tr key={l.ligne.rang} style={{ opacity: l.ignoree ? 0.5 : 1 }}>
                              <td style={cellule}>
                                <div style={{ fontWeight: 700, color: CD }}>{l.ligne.designation}</div>
                                {l.ligne.sousCategorie && <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{l.ligne.sousCategorie}</div>}
                                {message && <div role="alert" style={{ color: ROUGE, fontSize: '0.74rem', fontWeight: 600, marginTop: 3 }}>{message}</div>}
                              </td>
                              <td style={{ ...cellule, textAlign: 'right', fontWeight: 700 }}>{qte(l.ligne.quantite)}</td>
                              <td style={{ ...cellule, textAlign: 'right', whiteSpace: 'nowrap' }}>{dt(l.ligne.montant)}</td>
                              <td style={cellule}>
                                <select value={c.produit ?? ''} disabled={l.ignoree} aria-label={`Ce qui a été vendu pour « ${l.ligne.designation} »`}
                                  onChange={(e) => modifier(l.ligne.rang, { produit: e.target.value || null, etat: e.target.value ? 'choisie' : 'a_choisir' })}
                                  style={{ width: '100%', padding: '5px 6px', borderRadius: 8, border: `1.5px solid ${!l.ignoree && !l.produit ? ROUGE : CB}`, fontSize: '0.82rem', color: CD, background: '#fff' }}>
                                  <option value="">— Choisir —</option>
                                  {carte.map((p) => <option key={p.cle} value={p.cle}>{p.nom}</option>)}
                                </select>
                                {!l.ignoree && (
                                  <span title={badge.aide} style={{ display: 'inline-block', marginTop: 4, fontSize: '0.66rem', fontWeight: 800, background: badge.fond, color: badge.couleur, borderRadius: 20, padding: '1px 8px' }}>{badge.texte}</span>
                                )}
                              </td>
                              <td style={{ ...cellule, textAlign: 'center', fontWeight: 700, color: livraison || l.ignoree ? '#cbd5e1' : CD }}>
                                {livraison || l.ignoree ? '—' : qte(r.directe)}
                              </td>
                              {prets.map((p) => {
                                const ferme = l.ignoree || (l.produit !== null && !l.produit.canaux.includes(p.id));
                                const calcule = r.calcules.includes(p.id);
                                return (
                                  <td key={p.id} style={{ ...cellule, textAlign: 'center' }}>
                                    {ferme && !(c.saisies[p.id] ?? '').trim()
                                      ? <span title={l.ignoree ? 'Ligne ignorée' : `Pas en ${voc.nom('vente')} sur ce canal`} style={{ color: '#cbd5e1' }}>—</span>
                                      : (
                                        <input type="text" inputMode="decimal" value={c.saisies[p.id] ?? ''} disabled={l.ignoree}
                                          placeholder={calcule ? qte(r.parPrestataire[p.id]) : '0'}
                                          aria-label={`Quantité chez ${p.prestataire_nom} pour « ${l.ligne.designation} »`}
                                          title={calcule ? 'Calculé : le reste de la ligne' : undefined}
                                          onChange={(e) => modifier(l.ligne.rang, { saisies: { ...c.saisies, [p.id]: e.target.value } })}
                                          style={{ width: 64, padding: '5px 6px', borderRadius: 8, textAlign: 'center', fontSize: '0.84rem', fontWeight: 700, color: CD,
                                            border: `1.5px solid ${message ? ROUGE : CB}`, background: calcule ? '#f0fdf4' : '#fff' }} />
                                      )}
                                  </td>
                                );
                              })}
                              <td style={{ ...cellule, textAlign: 'center' }}>
                                <input type="checkbox" checked={l.ignoree} aria-label={`Ignorer « ${l.ligne.designation} »`}
                                  onChange={(e) => modifier(l.ligne.rang, { ignoree: e.target.checked })} style={{ accentColor: C, width: 16, height: 16 }} />
                              </td>
                            </tr>
                          );
                        }),
                      ];
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <div style={{ fontSize: '0.84rem', color: CD }}>
                  <strong>À enregistrer : {dt(b.total)}</strong>
                  {lu.totalLu !== null && <span style={{ color: Math.abs(lu.totalLu - b.total) < 0.0011 ? '#166534' : '#92400e' }}> · total du fichier {dt(lu.totalLu)}</span>}
                  {b.ignorees > 0 && <span style={{ color: '#64748b' }}> · {b.ignorees} ligne{b.ignorees > 1 ? 's' : ''} ignorée{b.ignorees > 1 ? 's' : ''}</span>}
                  <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 3 }}>
                    {Object.entries(b.parCanal).map(([canal, total]) => `${nomCanal(canal)} ${dt(total)}`).join(' · ')}
                  </div>
                  {(b.sansProduit > 0 || b.enErreur > 0) && (
                    <div style={{ fontSize: '0.78rem', color: ROUGE, fontWeight: 600, marginTop: 3 }}>
                      {b.sansProduit > 0 ? `${b.sansProduit} ligne${b.sansProduit > 1 ? 's' : ''} à rattacher ou à ignorer` : ''}
                      {b.sansProduit > 0 && b.enErreur > b.sansProduit ? ' · ' : ''}
                      {b.enErreur > b.sansProduit ? 'des quantités restent à répartir' : ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" onClick={passer} disabled={envoi} style={boutonSecond}>{libellePasser}</button>
                  <button type="button" onClick={enregistrer} disabled={!pret}
                    style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: pret ? C : '#e5e7eb', color: pret ? '#fff' : '#9ca3af', fontWeight: 800, cursor: pret ? 'pointer' : 'not-allowed', fontSize: '0.86rem' }}>
                    {envoi ? 'Enregistrement…' : `💾 ${dejaImporte && remplacer ? 'Remplacer et enregistrer' : 'Enregistrer'} ${voc.le('vente', true)}`}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
