// Factures fournisseur, étape F3 (labflow-reprise/achats-compta/PLAN-FACTURES.md §2 « F3 ») : la fenêtre « Vérifier la
// facture ». À gauche la facture déposée (pages, zoom ; la ligne choisie y est encadrée) ; à droite ses lignes lues,
// chacune avec l'article LabFlow proposé et la conversion « 1 unité de la facture = N unités de stock », ou « hors
// stock » ; en pied, les totaux lus et recalculés. Rien ne s'enregistre avant « Valider et enregistrer », qui reste fermé
// tant qu'une ligne est à choisir ou qu'une proposition n'est pas confirmée. Fermer la fenêtre abandonne tout (réponse
// 11 du client). La validation envoie la facture, sa pièce et ses lignes d'un seul coup ; LabFlow apprend alors chaque
// correspondance, et la facture n'est plus modifiable (supprimable en entier, page Factures).
import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../../../api/client';
import { useVocabulaire } from '../../../hooks/useVocabulaire';
import { useConfirm } from '../../common/ConfirmDialog';
import type { EnteteLu, LigneLue, PageVue, PreparationPage } from './lecture/types';
import type { ApercuPage } from './lecture/lireFacture';
import { cadreSurOriginal, ordonnerCoins } from './lecture/image';
import type { ResultatLecture } from './LectureFacture';
import {
  NATURES, ecartArrondiStock, ecartDePrix, probablesPour, proposer, proposerConversion, totauxRecalcules,
  type ArticleConnu, type Contexte, type EtatLigne, type NatureHorsStock,
} from './lecture/correspondre';
import ChoixArticle from './ChoixArticle';
import { useComptaActif } from './compta';
import { messageErreur, validerAvecConfirmation, type FactureValidee, type FichierChoisi, type LectureEnvoyee, type LigneValidee } from './pieces';

interface Props {
  fichiers: FichierChoisi[];
  lu: EnteteLu & { duree: number };
  lecture: LectureEnvoyee;
  cible: { type: 'activite' | 'labo'; id: number };
  fournisseurId: number;
  fournisseurNom: string;
  refFacture: string;
  date: string;
  accent: string;
  onFermer: () => void;
  onValidee: (r: FactureValidee) => void;
  /** Étape F5 : relire la facture avec une page recadrée ou pivotée (absent : pas de bouton). */
  relire?: ResultatLecture['relire'];
}

/** Timbre lu (1, 1,5 ou 2 DT ; aucun), sinon 1 DT. */
const timbreDe = (e: EnteteLu) => (e.totaux.timbre != null && TIMBRES.includes(e.totaux.timbre) ? e.totaux.timbre : 1);
/** Remise imprimée au pied qui ne figure pas déjà dans les montants des lignes : Σ lignes − HT. */
const remiseDe = (e: EnteteLu) => {
  const somme = e.lignesFacture.reduce((s, l) => s + (l.montant ?? 0), 0);
  const ecart = e.totaux.ht !== null ? somme - e.totaux.ht : 0;
  return e.totaux.remise !== null && ecart > 0.0005 && Math.abs(ecart - e.totaux.remise) <= 0.011 ? f3(ecart) : '';
};

/** Étape F5 : clé d'une page (comme lecture/lireFacture.ts, cleDePage). */
const clePage = (fichier: number, page: number) => `${fichier}:${page}`;
/** Cadre par défaut de « Recadrer » : la page entière, une marge de 3 %. */
const COINS_PAGE: [number, number][] = [[0.03, 0.03], [0.97, 0.03], [0.97, 0.97], [0.03, 0.97]];

interface LigneEdition {
  id: string;
  designation: string;
  reference: string;
  unite: string;
  quantite: string;
  prix: string;
  remise: string;
  tva: string;
  montant: string;
  /** 'a:<id article>' | 'h:<nature hors stock>' | '' */
  choix: string;
  conversion: string;
  etat: EtatLigne | 'confirmee';
  raison: string;
  conversionSure: boolean;
  lue: LigneLue | null;
  creation: { nom: string; uniteId: string; categorieId: string; enCours: boolean; erreur: string | null } | null;
}

const TIMBRES = [0, 1, 1.5, 2];
const VALEUR_MAX = 9999999.999; // quantité (et quantité en stock) au plus, comme le serveur (DECIMAL(10,3))
const f3 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '' : n.toFixed(3).replace('.', ','));
const fNb = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '' : String(Math.round(n * 1e6) / 1e6).replace('.', ','));
/** Nombre saisi (« 1 234,5 », « 12.5 », « 19 % ») ; null si vide ou illisible. */
const nb = (s: string): number | null => {
  const t = s.replace(/[\s%]/g, '').replace(',', '.');
  if (!t || !/^-?\d*\.?\d+$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};
const ETATS: Record<LigneEdition['etat'], { libelle: string; fond: string; texte: string }> = {
  reconnue: { libelle: 'reconnue', fond: '#dcfce7', texte: '#166534' },
  confirmee: { libelle: 'confirmée', fond: '#dcfce7', texte: '#166534' },
  proposee: { libelle: 'proposée, à confirmer', fond: '#fef3c7', texte: '#92400e' },
  a_choisir: { libelle: 'à choisir', fond: '#fee2e2', texte: '#991b1b' },
};
const petit: React.CSSProperties = { padding: '3px 6px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.78rem', background: '#fff', minWidth: 0 };
const bouton: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' };
const etiquette: React.CSSProperties = { fontSize: '0.6rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' };

export default function VerifierFacture({ fichiers, lu: luInitial, lecture, cible, fournisseurId, fournisseurNom, refFacture, date, accent, onFermer, onValidee, relire }: Props) {
  const voc = useVocabulaire();
  const { confirm } = useConfirm();
  // Étape F5 : la lecture affichée — celle du bloc de saisie, ou une relecture (page recadrée ou pivotée).
  const [lu, setLu] = useState(luInitial);
  const luRef = useRef(lu);
  useEffect(() => { luRef.current = lu; }, [lu]);
  const [preparations, setPreparations] = useState<Record<string, PreparationPage>>({});
  const [relecture, setRelecture] = useState<string | null>(null);
  const [recadrage, setRecadrage] = useState<{ cle: string; coins: [number, number][] } | null>(null);
  const [ctx, setCtx] = useState<Contexte | null>(null);
  const [ctxErreur, setCtxErreur] = useState<string | null>(null);
  const [lignes, setLignes] = useState<LigneEdition[]>([]);
  const [choisie, setChoisie] = useState<number | null>(null);
  const [apercus, setApercus] = useState<ApercuPage[] | null>(null);
  const [apercuErreur, setApercuErreur] = useState<string | null>(null);
  const [pageVue, setPageVue] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [timbre, setTimbre] = useState(() => timbreDe(lu));
  const [fodec, setFodec] = useState(() => f3(lu.totaux.fodec));
  const [remiseGlobale, setRemiseGlobale] = useState(() => remiseDe(lu));
  const [unites, setUnites] = useState<{ id: number; name: string }[] | null>(null);
  const [categories, setCategories] = useState<{ id: number; name: string; familleName?: string | null }[] | null>(null);
  const [envoi, setEnvoi] = useState(false);
  // Étape F4 : « Envoyer à la comptabilité », cochée, si le module Compta est actif.
  const comptaActif = useComptaActif();
  const [envoyerCompta, setEnvoyerCompta] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [modifiee, setModifiee] = useState(false);
  const compteur = useRef(0);
  const nouvelId = () => `l${++compteur.current}`;
  const tolerance = lu.source === 'pdf' ? 0.0015 : 0.011;
  // TVA d'une ligne qui n'en imprime pas : le seul taux de la facture, ou 0 pour un document sans TVA ; sinon à choisir.
  const tvaParDefautDe = (e: EnteteLu) => (e.totaux.parTaux.length === 1 ? e.totaux.parTaux[0].taux : e.totaux.tva === 0 ? 0 : null);
  const tvaParDefaut = tvaParDefautDe(lu);

  // Lignes lues → lignes à vérifier, avec ce que LabFlow propose. Une ligne lue en TTC (colonnes « Montant TTC ») est
  // ramenée en HT avec son taux. `e` : la lecture (étape F5 : une relecture remplace les lignes).
  const preparer = (c: Contexte, e: EnteteLu = luRef.current): LigneEdition[] => e.lignesFacture.map((l) => {
    const p = proposer(l, c);
    const tva = l.tauxTva ?? tvaParDefautDe(e);
    let montant = l.montant;
    let prix = l.prixUnitaire;
    let raison = p.raison;
    if (montant === null && l.luEnTtc && l.montantTtc !== null && tva !== null) {
      montant = Math.round((l.montantTtc / (1 + tva / 100)) * 1000) / 1000;
      if (prix === null && l.prixTtc !== null) prix = Math.round((l.prixTtc / (1 + tva / 100)) * 1000) / 1000;
    }
    if (l.luEnTtc) raison = `lue en TTC, ramenée en HT${raison ? ` · ${raison}` : ''}`;
    return {
      id: nouvelId(), designation: l.designation, reference: l.reference ?? '', unite: l.unite ?? '',
      quantite: fNb(l.quantite), prix: f3(prix), remise: l.remise ? fNb(l.remise) : '', tva: tva === null ? '' : fNb(tva),
      montant: f3(montant), choix: p.articleId ? `a:${p.articleId}` : p.horsStock ? `h:${p.horsStock}` : '',
      conversion: fNb(p.conversion), etat: p.etat, raison, conversionSure: p.conversionSure, lue: l, creation: null,
    };
  });
  // Contexte : correspondances de ce fournisseur, articles déjà achetés chez lui, articles du compte ; les lignes sont
  // préparées dès qu'il arrive (une seule fois : un nouvel essai après une erreur ne refait pas les choix).
  const lireContexte = () => api.get('/api/correspondances/contexte', { params: { fournisseurId, type: cible.type, id: cible.id }, timeout: 20_000 });
  const appliquer = (c: Contexte) => {
    setCtx(c);
    setCtxErreur(null);
    setLignes((ls) => (ls.length ? ls : preparer(c)));
  };
  const erreurContexte = (e: unknown) => setCtxErreur(messageErreur(e, `La liste ${voc.du('article', true)} n'a pas pu être chargée.`));
  const charger = () => { lireContexte().then(({ data }) => appliquer(data as Contexte)).catch(erreurContexte); };
  useEffect(() => {
    let vivant = true;
    lireContexte().then(({ data }) => { if (vivant) appliquer(data as Contexte); }).catch((e) => { if (vivant) erreurContexte(e); });
    return () => { vivant = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Images des pages (rendues dans ce navigateur), libérées à la fermeture.
  useEffect(() => {
    const arret = new AbortController();
    let faites: ApercuPage[] = [];
    void (async () => {
      try {
        const { apercusDeFacture } = await import('./lecture/lireFacture');
        faites = await apercusDeFacture(fichiers.map((f) => ({ fichier: f.fichier, type: f.type, apercu: f.apercu })), arret.signal);
        if (!arret.signal.aborted) setApercus(faites);
      } catch {
        if (!arret.signal.aborted) setApercuErreur('La facture ne peut pas être affichée ici ; ouvrez-la à côté pour la relire.');
      }
    })();
    return () => { arret.abort(); faites.forEach((a) => URL.revokeObjectURL(a.url)); };
  }, [fichiers]);

  const articles = useMemo(() => new Map((ctx?.articles ?? []).map((a) => [a.id, a])), [ctx]);
  const dernierPrix = useMemo(() => new Map((ctx?.achats ?? []).map((a) => [a.articleId, a.dernierPrix])), [ctx]);
  const achetes = useMemo(() => new Set((ctx?.achats ?? []).map((a) => a.articleId)), [ctx]);
  // Articles classés par ligne, calculés une fois par désignation (la fenêtre se redessine à chaque frappe).
  const probables = useMemo(() => (ctx ? probablesPour(ctx) : null), [ctx]);
  // Libellés du choix d'article (champ de recherche : un compte peut avoir des milliers d'articles).
  const libellesChoix = {
    unArticle: voc.un('article'), aucunArticle: `${voc.Aucun('article')} ${voc.acc('article', 'trouvé', 'trouvée')}`,
    horsStock: `Hors ${voc.nom('stock')}`, groupeHorsStock: `Hors ${voc.nom('stock')} (reste sur la facture)`, aChoisir: '— À choisir —',
  };
  const groupeAchetes = `Déjà ${voc.acc('article', 'achetés', 'achetées', 2)} chez ${voc.ce('fournisseur')}`;
  const groupeAutres = `Autres ${voc.nom('article', true)}`;
  const horsDuLieu = `hors de ${cible.type === 'activite' ? voc.ce('activite') : voc.ce('labo')}`;

  // Une ligne est désignée par son identifiant (pas par sa place : une ligne retirée pendant une création d'article
  // décalerait les suivantes).
  const modifierId = (id: string, champs: Partial<LigneEdition>, confirmer = true) => {
    setModifiee(true);
    setLignes((ls) => ls.map((l) => (l.id === id ? { ...l, ...champs, ...(confirmer && (l.etat === 'proposee' || l.etat === 'a_choisir') ? { etat: 'confirmee' } : {}) } : l)));
  };
  const modifier = (i: number, champs: Partial<LigneEdition>, confirmer = true) => {
    const id = lignes[i]?.id;
    if (id) modifierId(id, champs, confirmer);
  };
  const choisir = (i: number, choix: string) => {
    const l = lignes[i];
    const article = choix.startsWith('a:') ? articles.get(Number(choix.slice(2))) : undefined;
    const c = article ? proposerConversion(l.designation, l.unite || null, article.unite) : null;
    modifier(i, {
      choix, etat: choix ? 'confirmee' : 'a_choisir',
      ...(c ? { conversion: fNb(c.n), conversionSure: c.sure, raison: c.sure ? `conversion : ${c.raison}` : '' } : { raison: '' }),
    }, false);
  };
  const ajouterLigne = () => {
    setModifiee(true);
    setLignes((ls) => [...ls, {
      id: nouvelId(), designation: '', reference: '', unite: '', quantite: '1', prix: '', remise: '', tva: tvaParDefaut === null ? '' : fNb(tvaParDefaut),
      montant: '', choix: '', conversion: '1', etat: 'a_choisir', raison: 'ligne ajoutée à la main', conversionSure: false, lue: null, creation: null,
    }]);
  };

  // Lignes lisibles (nombres, arrondis comme au serveur : millime, TVA au centième, conversion au millionième) et
  // totaux recalculés.
  const arrondi = (x: number | null, pas: number) => (x === null ? null : Math.round(x * pas) / pas);
  const valeurs = lignes.map((l) => {
    const q = arrondi(nb(l.quantite), 1000), m = arrondi(nb(l.montant), 1000), p = arrondi(nb(l.prix), 1000);
    const r = arrondi(nb(l.remise), 1000) ?? 0, t = arrondi(nb(l.tva), 100), conv = arrondi(nb(l.conversion), 1e6);
    const article = l.choix.startsWith('a:') ? articles.get(Number(l.choix.slice(2))) ?? null : null;
    return { q, m, p, r, t, conv, article, horsStock: l.choix.startsWith('h:') ? l.choix.slice(2) as NatureHorsStock : null };
  });
  const pied = { remiseGlobale: nb(remiseGlobale) ?? 0, fodec: nb(fodec) ?? 0, timbre };
  const calcul = totauxRecalcules(valeurs.map((v) => ({
    quantite: v.q ?? 0, montant: v.m ?? 0, tauxTva: v.t ?? 0, conversion: v.article ? v.conv : null,
  })), pied);

  // Ce qui empêche de valider, en clair.
  const blocages: string[] = [];
  const n = (k: number) => `${k} ligne${k > 1 ? 's' : ''}`;
  const compter = (f: (l: LigneEdition, i: number) => boolean) => lignes.filter(f).length;
  if (!lignes.length) blocages.push('aucune ligne');
  const aChoisir = compter((l) => !l.choix);
  if (aChoisir) blocages.push(`${n(aChoisir)} à choisir (${voc.nom('article')} ou hors ${voc.nom('stock')})`);
  const aConfirmer = compter((l) => Boolean(l.choix) && l.etat === 'proposee');
  if (aConfirmer) blocages.push(`${aConfirmer} proposition${aConfirmer > 1 ? 's' : ''} à confirmer`);
  const sansTva = compter((_, i) => valeurs[i].t === null || valeurs[i].t! < 0 || valeurs[i].t! > 100);
  if (sansTva) blocages.push(`TVA à choisir sur ${n(sansTva)}`);
  // Mêmes contrôles que le serveur : une ligne refusée là-bas ne doit pas pouvoir partir d'ici.
  const malLues = compter((l, i) => {
    const v = valeurs[i];
    return !l.designation.trim() || !(v.q! > 0) || v.q! > VALEUR_MAX || v.m === null || (Boolean(v.article) && v.m < 0)
      || (Boolean(l.prix.trim()) && v.p === null) || (Boolean(v.article) && v.p !== null && v.p < 0)
      || (Boolean(l.remise.trim()) && nb(l.remise) === null) || v.r < 0 || v.r > 100
      || (Boolean(v.article) && (!(v.conv! > 0) || Math.round((v.q ?? 0) * (v.conv ?? 0) * 1000) / 1000 <= 0
        || (v.q ?? 0) * (v.conv ?? 0) > VALEUR_MAX));
  });
  if (malLues) blocages.push(`${n(malLues)} incomplète${malLues > 1 ? 's' : ''} ou illisible${malLues > 1 ? 's' : ''} (désignation, quantité, prix, remise de 0 à 100 %, montant ou conversion)`);
  if (lignes.length && calcul.ht < 0) blocages.push('total HT négatif (les retours dépassent les achats)');
  const conversionsDouteuses = compter((l, i) => Boolean(valeurs[i].article) && !l.conversionSure);
  if (conversionsDouteuses) blocages.push(`conversion à vérifier sur ${n(conversionsDouteuses)} (✓ Conversion juste, ou corrigez-la)`);
  const arrondis = valeurs.map((v, i) => (v.article && v.q && v.conv ? ecartArrondiStock(calcul.couts[i], v.q, v.conv, calcul.prixStock[i]) : null));
  const tropPetits = arrondis.filter((x) => x !== null).length;
  if (tropPetits) blocages.push(`${n(tropPetits)} au prix par unité trop petit pour le millime : choisissez ${voc.un('article')} à l'unité plus grande (kg plutôt que g, paquet ou carton plutôt que pièce)`);
  if (lignes.length > 300) blocages.push('300 lignes au plus par facture');
  if (lignes.length && !valeurs.some((v) => v.article)) blocages.push(`aucune ligne n'entre en ${voc.nom('stock')} (choisissez au moins ${voc.un('article')})`);
  if (!ctx) blocages.push(`liste ${voc.du('article', true)} non chargée`);
  const remiseLue = nb(remiseGlobale);
  const totalPositif = valeurs.reduce((s, v) => s + Math.max(0, v.m ?? 0), 0);
  if (remiseGlobale.trim() && (remiseLue === null || remiseLue < 0)) blocages.push('remise globale illisible');
  else if ((remiseLue ?? 0) > totalPositif + 0.0005) blocages.push('remise globale plus grande que les lignes');
  if (fodec.trim() && (nb(fodec) === null || nb(fodec)! < 0)) blocages.push('FODEC illisible');

  const valider = async () => {
    if (blocages.length || envoi || relecture) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const lignesValidees: LigneValidee[] = lignes.map((l, i) => {
        const v = valeurs[i];
        const base = {
          designation: l.designation.trim(), reference: l.reference.trim() || null, unite: l.unite.trim() || null,
          // Texte LU : la clé apprise se calcule dessus (la facture suivante sera lue pareil, pas corrigée pareil).
          ...(l.lue ? { designationLue: l.lue.designationCle || l.lue.designation, referenceLue: l.lue.reference ?? '' } : {}),
          quantite: v.q as number, prixUnitaire: v.p, remise: v.r, tauxTva: v.t as number, montant: v.m as number,
        };
        return v.article ? { ...base, articleId: v.article.id, conversion: v.conv as number } : { ...base, horsStock: v.horsStock as NatureHorsStock };
      });
      // Étape F5 : la mise en page vue n'est apprise (et partagée) que si la lecture a vu le titre des colonnes et que ses
      // lignes ont été gardées (montant inchangé pour 60 % des lignes au moins) — une lecture corrigée de partout ne
      // devient jamais le modèle d'un fournisseur.
      // Une ligne lue en TTC (sans montant HT) est gardée si son TTC recalculé est celui lu.
      const gardee = (l: LigneEdition, i: number) => {
        const m = valeurs[i].m, t = valeurs[i].t;
        if (!l.lue || m === null) return false;
        if (l.lue.montant !== null) return Math.abs(m - l.lue.montant) < 0.0015;
        return l.lue.luEnTtc && l.lue.montantTtc !== null && t !== null && Math.abs(m * (1 + t / 100) - l.lue.montantTtc) < 0.011;
      };
      const gardees = lignes.filter(gardee).length;
      const fiable = lignes.length > 0 && gardees >= Math.max(1, 0.6 * lignes.length);
      // Ce qui a été lu : la dernière lecture (une relecture remplace la première).
      const t = lu.totaux;
      const r = await validerAvecConfirmation({
        cible, dateAppro: date, fournisseurId, refFacture: refFacture.trim(), timbreFiscal: timbre > 0, timbreMontant: timbre > 0 ? timbre : undefined,
        lecture: {
          ...lecture, source: lu.source, matricule: lu.matricule?.valeur ?? lecture.matricule, nom: lu.nom?.valeur ?? lecture.nom,
          numero: lu.numero?.valeur ?? lecture.numero, date: lu.date?.valeur ?? lecture.date,
          totaux: { ht: t.ht, tva: t.tva, timbre: t.timbre, ttc: t.ttc, fodec: t.fodec, remise: t.remise },
          miseEnPage: fiable ? lu.miseEnPage ?? null : null,
        },
        fodec: pied.fodec || null, remiseGlobale: pied.remiseGlobale || null, lignes: lignesValidees,
        envoyerCompta: comptaActif === true && envoyerCompta,
      }, fichiers, confirm, voc.ce('fournisseur'));
      if (r) onValidee(r);
      else setEnvoi(false);
    } catch (e) {
      setErreur(messageErreur(e, 'La facture n\'a pas pu être enregistrée : rien n\'a été écrit, réessayez.'));
      setEnvoi(false);
    }
  };

  const fermer = async () => {
    if (envoi) return;
    if (modifiee || lignes.length) {
      const ok = await confirm({
        title: 'Abandonner la vérification ?',
        message: `Rien n'est enregistré (ni les lignes, ni la pièce, ni les choix faits ici), sauf ${voc.le('article', true)} que vous avez ${voc.acc('article', 'créés', 'créées', 2)} depuis cette fenêtre. La facture reste déposée dans le bloc de saisie.`,
        confirmLabel: 'Abandonner', tone: 'danger', icon: '✖️',
      });
      if (!ok) return;
    }
    onFermer();
  };

  // Étape F5 : relire la facture avec une page recadrée (« Recadrer ») ou tournée (« Pivoter ») — les lignes sont
  // remplacées par la nouvelle lecture (les choix faits sur les lignes sont perdus : confirmé avant).
  // La relecture en cours s'arrête si la fenêtre se ferme ; la liste des articles est lue au moment où elle se termine
  // (relecture des écrans : arrivée pendant la relecture, elle était perdue et les lignes restaient vides).
  const arretRelecture = useRef<AbortController | null>(null);
  useEffect(() => () => arretRelecture.current?.abort(), []);
  const ctxRef = useRef(ctx);
  useEffect(() => { ctxRef.current = ctx; }, [ctx]);
  const relireAvec = async (prep: Record<string, PreparationPage>) => {
    if (!relire || relecture || envoi) return;
    if (modifiee) {
      const ok = await confirm({
        title: 'Relire la facture ?',
        message: `Les lignes et le bas de la facture (remise, FODEC, timbre) seront relus sur la page recadrée ou tournée : les choix déjà faits (${voc.nom('article', true)}, conversions, corrections, montants du bas) seront perdus.`,
        confirmLabel: 'Relire', tone: 'primary', icon: '🔁',
      });
      if (!ok) return;
    }
    setRecadrage(null);
    setRelecture('Relecture…');
    setErreur(null);
    const controle = new AbortController();
    arretRelecture.current = controle;
    try {
      const e = await relire(prep, (etape, a) => setRelecture(a === undefined ? etape : `${etape} ${Math.round(a * 100)} %`), controle.signal);
      if (controle.signal.aborted) return;
      setPreparations(prep);
      setLu(e);
      luRef.current = e;
      setChoisie(null);
      setModifiee(false);
      // Le pied aussi vient de la nouvelle lecture (la relecture sert quand la première était mauvaise).
      setTimbre(timbreDe(e));
      setFodec(f3(e.totaux.fodec));
      setRemiseGlobale(remiseDe(e));
      setLignes(ctxRef.current ? preparer(ctxRef.current, e) : []);
    } catch {
      if (!controle.signal.aborted) setErreur('La relecture n\'a pas abouti : les lignes d\'avant sont gardées. Vous pouvez les corriger à la main.');
    } finally {
      if (arretRelecture.current === controle) arretRelecture.current = null;
      setRelecture(null);
    }
  };

  // Création d'un article depuis une ligne (nom tiré de la désignation, unité et catégorie à choisir).
  const ouvrirCreation = async (i: number) => {
    const { id, designation } = lignes[i];
    const nom = designation.replace(/\(.*?\)/g, ' ').replace(/\b\d+([.,]\d+)?\s*(kg|g|gr|l|lt|ml|cl)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    modifierId(id, { creation: { nom: nom.slice(0, 100), uniteId: '', categorieId: '', enCours: false, erreur: null } }, false);
    if (!unites || !categories) {
      try {
        const [u, c] = await Promise.all([api.get('/api/unites'), api.get('/api/categories')]);
        setUnites(u.data as { id: number; name: string }[]);
        setCategories(c.data as { id: number; name: string; familleName?: string | null }[]);
      } catch (e) {
        modifierId(id, { creation: { nom, uniteId: '', categorieId: '', enCours: false, erreur: messageErreur(e, 'Unités et catégories non chargées : réessayez.') } }, false);
      }
    }
  };
  const creerArticle = async (i: number) => {
    const { id, designation, unite, creation: c } = lignes[i];
    if (!c || !c.nom.trim() || !c.uniteId || c.enCours) return;
    modifierId(id, { creation: { ...c, enCours: true, erreur: null } }, false);
    try {
      const { data } = await api.post('/api/articles', { name: c.nom.trim(), unitId: Number(c.uniteId), categorieId: c.categorieId ? Number(c.categorieId) : null });
      const a = data as { id: number; name: string; unitName?: string; categorieName?: string | null };
      const nouveau: ArticleConnu = { id: a.id, nom: a.name, unite: a.unitName ?? unites?.find((u) => String(u.id) === c.uniteId)?.name ?? '', categorie: a.categorieName ?? null, selectionne: false };
      setCtx((x) => (x ? { ...x, articles: [...x.articles, nouveau] } : x));
      const conv = proposerConversion(designation, unite || null, nouveau.unite);
      modifierId(id, { creation: null, choix: `a:${nouveau.id}`, etat: 'confirmee', conversion: fNb(conv.n), conversionSure: conv.sure, raison: `${voc.nom('article')} ${voc.acc('article', 'créé', 'créée')}` }, false);
    } catch (e) {
      modifierId(id, { creation: { ...c, enCours: false, erreur: messageErreur(e, `${voc.Nom('article')} non ${voc.acc('article', 'créé', 'créée')}.`) } }, false);
    }
  };

  // Page affichée et cadre de la ligne choisie.
  const cadreChoisi = choisie !== null ? lignes[choisie]?.lue?.cadre ?? null : null;
  const pageDuCadre = cadreChoisi ? lu.pages[cadreChoisi.page - 1] : null;
  /** Choisir une ligne : elle est encadrée, et sa page affichée. */
  const choisirLigne = (i: number) => {
    setChoisie(i);
    const cadre = lignes[i]?.lue?.cadre;
    const p = cadre ? lu.pages[cadre.page - 1] : null;
    const k = p && apercus ? apercus.findIndex((a) => a.fichier === p.fichier && a.page === p.page) : -1;
    if (k >= 0) setPageVue(k);
  };
  const apercu = apercus?.[pageVue] ?? null;
  // Étape F5 : sur une image (photo, PDF numérisé), le cadre est replacé sur l'image d'origine (feuille recadrée, page
  // tournée) ; sur le texte d'un PDF, la page lue est l'image affichée.
  const fractions = (c: { x0: number; y0: number; x1: number; y1: number }, p: PageVue) => (p.trajet
    ? cadreSurOriginal(p.trajet, c)
    : { x0: c.x0 / p.largeur, y0: c.y0 / p.hauteur, x1: c.x1 / p.largeur, y1: c.y1 / p.hauteur });
  const cadreVu = cadreChoisi && pageDuCadre && apercu && apercu.fichier === pageDuCadre.fichier && apercu.page === pageDuCadre.page
    ? fractions(cadreChoisi, pageDuCadre) : null;
  const encadre = cadreVu
    ? {
      left: `${cadreVu.x0 * 100 - 0.6}%`, top: `${cadreVu.y0 * 100 - 0.4}%`,
      width: `${(cadreVu.x1 - cadreVu.x0) * 100 + 1.2}%`, height: `${(cadreVu.y1 - cadreVu.y0) * 100 + 0.8}%`,
    }
    : null;
  // Étape F5 : la page d'image affichée (lue par reconnaissance de caractères) — « Recadrer », « Pivoter ».
  const pageImage = apercu ? lu.pages.find((p) => p.trajet && p.fichier === apercu.fichier && p.page === apercu.page) ?? null : null;
  const cleAffichee = apercu ? clePage(apercu.fichier, apercu.page) : null;
  const ouvrirRecadrage = () => {
    if (!pageImage?.trajet || !cleAffichee) return;
    const t = pageImage.trajet;
    const choisis = preparations[cleAffichee]?.coins;
    const trouves = t.coins ? t.coins.map(([x, y]) => [x / t.tailles.reduite[0], y / t.tailles.reduite[1]] as [number, number]) : null;
    setRecadrage({ cle: cleAffichee, coins: choisis ?? trouves ?? COINS_PAGE });
  };
  const pivoter = () => {
    if (!pageImage?.trajet || !cleAffichee) return;
    const actuel = preparations[cleAffichee]?.quarts ?? pageImage.trajet.quarts;
    void relireAvec({ ...preparations, [cleAffichee]: { ...preparations[cleAffichee], quarts: (actuel + 1) % 4 } });
  };
  // Relire le cadre choisi : les coins remis dans l'ordre ; un cadre qui se croise est refusé.
  const relireCadre = () => {
    if (!recadrage) return;
    const coins = ordonnerCoins(recadrage.coins);
    if (!coins) { setErreur('Le cadre se croise ou est trop petit : placez un coin à chaque angle de la facture.'); return; }
    void relireAvec({ ...preparations, [recadrage.cle]: { ...preparations[recadrage.cle], coins } });
  };
  // Déplacer un coin du cadre (pointeur : souris, doigt).
  const zoneRecadrage = useRef<HTMLDivElement>(null);
  const coinTenu = useRef<number | null>(null);
  const deplacerCoin = (ev: React.PointerEvent) => {
    const k = coinTenu.current;
    const zone = zoneRecadrage.current;
    if (k === null || !zone || !recadrage) return;
    const r = zone.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
    setRecadrage((c) => (c ? { ...c, coins: c.coins.map((p, i) => (i === k ? [x, y] : p)) as [number, number][] } : c));
  };

  const t = lu.totaux;
  // Une facture arrondit souvent la TVA ligne par ligne : quelques millimes d'écart sont admis selon le nombre de lignes.
  const toleranceTotaux = lu.source === 'pdf' ? Math.max(0.0015, 0.0005 * lignes.length) : Math.max(0.011, 0.0005 * lignes.length);
  const comparer = (luV: number | null, recalcule: number) => (luV === null ? null : Math.abs(luV - recalcule) <= toleranceTotaux);
  const marque = (ok: boolean | null) => (ok === null ? <span style={{ color: '#94a3b8' }} title="non lu sur la facture" aria-label="non lu">—</span>
    : ok ? <span style={{ color: '#15803d' }} title="identique à la facture" aria-label="identique à la facture">✓</span> : <span style={{ color: '#b45309' }} title="différent de la facture" aria-label="différent de la facture">⚠</span>);
  const sommeLignes = valeurs.reduce((s, v) => s + (v.m ?? 0), 0);
  // Lignes imprimées TTC (ticket de grande surface, colonne « Montant TTC ») : leur somme donne le TTC, pas le HT.
  const lignesEnTtc = t.ttc !== null && lignes.length > 0 && valeurs.every((v) => v.t !== null)
    && Math.abs(sommeLignes - (t.ttc - (t.timbre ?? 0))) <= toleranceTotaux
    && (t.ht === null || Math.abs(sommeLignes - t.ht) > toleranceTotaux) && valeurs.some((v) => (v.t ?? 0) > 0);
  const ramenerEnHt = () => {
    setModifiee(true);
    setLignes((ls) => ls.map((l) => {
      const taux = nb(l.tva) ?? 0;
      const m = nb(l.montant), p = nb(l.prix);
      return { ...l, montant: m === null ? l.montant : f3(m / (1 + taux / 100)), prix: p === null ? l.prix : f3(p / (1 + taux / 100)) };
    }));
  };
  // Échap ferme (avec confirmation), comme le bouton Fermer ; le titre reçoit le focus à l'ouverture.
  const titre = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titre.current?.focus(); }, []);
  const nbStock = valeurs.filter((v) => v.article).length;
  const aConfirmerIdx = lignes.map((l, i) => (l.choix && l.etat === 'proposee' ? i : -1)).filter((i) => i >= 0);

  return (
    <div className="modal-overlay" style={{ zIndex: 1150, padding: 0 }} role="dialog" aria-modal="true" aria-label="Vérifier la facture"
      onKeyDown={(ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); void fermer(); } }}>
      <style>{`
        .vf-grille { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 0; height: 100%; min-height: 0; }
        .vf-page { border-right: 1px solid #e2e8f0; min-height: 0; display: flex; flex-direction: column; background: #f1f5f9; }
        .vf-droite { min-height: 0; overflow-y: auto; padding: 12px 16px 16px; }
        .vf-ligne-num { display: grid; grid-template-columns: 70px 70px 90px 60px 64px 100px; gap: 6px; }
        @media (max-width: 900px) {
          .vf-grille { grid-template-columns: 1fr; grid-template-rows: 38vh minmax(0, 1fr); }
          .vf-page { border-right: none; border-bottom: 1px solid #e2e8f0; }
          .vf-ligne-num { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>
      <div style={{ background: '#fff', width: '100%', height: '100%', maxWidth: 1500, maxHeight: '100vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        {/* En-tête */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', background: `${accent}0d` }}>
          <h2 ref={titre} tabIndex={-1} style={{ margin: 0, fontSize: '1.05rem', color: accent, outline: 'none' }}>🔎 Vérifier la facture</h2>
          <span style={{ fontSize: '0.8rem', color: '#334155' }}>
            <strong>{fournisseurNom}</strong> · n° <strong>{refFacture}</strong> · {date.split('-').reverse().join('/')}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>lu sur cet appareil ({lu.source === 'pdf' ? 'texte du PDF' : 'reconnaissance des caractères'}) — rien n'est enregistré avant la validation</span>
          {lu.miseEnPageConnue && (
            <span title={`Les colonnes des factures de ${voc.ce('fournisseur')} sont connues (apprises sur une facture déjà validée) et ont servi à lire les lignes.`}
              style={{ fontSize: '0.68rem', fontWeight: 700, color: '#065f46', background: '#d1fae5', borderRadius: 4, padding: '1px 6px' }}>📐 mise en page connue</span>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" style={bouton} onClick={() => void fermer()} disabled={envoi}>Fermer</button>
        </div>

        <div className="vf-grille" style={{ flex: 1, minHeight: 0 }}>
          {/* Gauche : la facture */}
          <div className="vf-page">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid #e2e8f0', background: '#fff', flexWrap: 'wrap' }}>
              <button type="button" style={bouton} disabled={!apercus || pageVue <= 0} onClick={() => setPageVue((p) => p - 1)} aria-label="Page précédente">‹</button>
              <span style={{ fontSize: '0.74rem', color: '#475569' }}>{apercus ? `page ${pageVue + 1} / ${apercus.length}` : 'préparation de l\'aperçu…'}</span>
              <button type="button" style={bouton} disabled={!apercus || pageVue >= apercus.length - 1} onClick={() => setPageVue((p) => p + 1)} aria-label="Page suivante">›</button>
              <div style={{ flex: 1 }} />
              {/* Étape F5 : une page lue sur une image se recadre ou se tourne, puis se relit. */}
              {relire && pageImage && !recadrage && (
                <>
                  <button type="button" style={bouton} disabled={Boolean(relecture) || envoi} onClick={ouvrirRecadrage}
                    title="Placer les quatre coins de la facture sur la photo, puis la relire">✂️ Recadrer</button>
                  <button type="button" style={bouton} disabled={Boolean(relecture) || envoi} onClick={pivoter}
                    title="Tourner la page d'un quart de tour, puis la relire (photo couchée ou à l'envers)">↻ Pivoter</button>
                </>
              )}
              {recadrage && recadrage.cle === cleAffichee && (
                <>
                  <button type="button" style={{ ...bouton, color: '#fff', border: 'none', background: accent }}
                    onClick={relireCadre}>✓ Relire ce cadre</button>
                  <button type="button" style={bouton} onClick={() => void relireAvec({ ...preparations, [recadrage.cle]: { ...preparations[recadrage.cle], coins: null } })}
                    title="Lire la photo entière, sans recadrage">Toute la photo</button>
                  <button type="button" style={bouton} onClick={() => setRecadrage(null)}>Annuler</button>
                </>
              )}
              <span role="status" style={{ fontSize: '0.74rem', color: accent, fontWeight: 700 }}>{relecture ?? ''}</span>
              <button type="button" style={bouton} disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))} aria-label="Réduire">−</button>
              <span style={{ fontSize: '0.74rem', color: '#475569', minWidth: 36, textAlign: 'center' }}>{Math.round(zoom * 100)} %</span>
              <button type="button" style={bouton} disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))} aria-label="Agrandir">+</button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 10, minHeight: 0 }}>
              {apercuErreur && <p style={{ fontSize: '0.8rem', color: '#9a3412' }}>{apercuErreur}</p>}
              {apercu && (
                <div style={{ position: 'relative', width: `${zoom * 100}%`, margin: '0 auto', boxShadow: '0 2px 10px rgba(0,0,0,0.12)', background: '#fff' }}>
                  <img src={apercu.url} alt={`Facture, page ${pageVue + 1}`} style={{ display: 'block', width: '100%', height: 'auto' }} />
                  {encadre && !recadrage && <div aria-hidden="true" style={{ position: 'absolute', ...encadre, border: `2px solid ${accent}`, background: `${accent}1f`, borderRadius: 3, pointerEvents: 'none' }} />}
                  {recadrage && recadrage.cle === cleAffichee && (
                    <div ref={zoneRecadrage} style={{ position: 'absolute', inset: 0 }}>
                      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                        <polygon points={recadrage.coins.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')} fill={`${accent}22`} stroke={accent} strokeWidth={4} vectorEffect="non-scaling-stroke" />
                      </svg>
                      {recadrage.coins.map(([x, y], k) => (
                        <div key={k} role="button" tabIndex={0}
                          aria-label={`${['Coin haut gauche', 'Coin haut droit', 'Coin bas droit', 'Coin bas gauche'][k]} (${Math.round(x * 100)} %, ${Math.round(y * 100)} %) : flèches pour le déplacer, Entrée pour relire, Échap pour annuler`}
                          onPointerDown={(ev) => { coinTenu.current = k; ev.currentTarget.setPointerCapture(ev.pointerId); ev.preventDefault(); }}
                          onPointerMove={deplacerCoin}
                          onPointerUp={() => { coinTenu.current = null; }} onPointerCancel={() => { coinTenu.current = null; }}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') { ev.preventDefault(); relireCadre(); return; }
                            if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); setRecadrage(null); return; }
                            const pas = ev.shiftKey ? 0.02 : 0.005;
                            const d: Record<string, [number, number]> = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] };
                            if (!d[ev.key]) return;
                            ev.preventDefault();
                            setRecadrage((c) => (c ? { ...c, coins: c.coins.map((q, i) => (i === k ? [Math.min(1, Math.max(0, q[0] + d[ev.key][0])), Math.min(1, Math.max(0, q[1] + d[ev.key][1]))] : q)) as [number, number][] } : c));
                          }}
                          style={{ position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, width: 26, height: 26, marginLeft: -13, marginTop: -13, borderRadius: '50%', background: '#fff', border: `3px solid ${accent}`, boxShadow: '0 1px 4px rgba(0,0,0,0.35)', cursor: 'grab', touchAction: 'none' }} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Droite : les lignes */}
          <div className="vf-droite">
            {ctxErreur && (
              <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, padding: '8px 10px', fontSize: '0.8rem', marginBottom: 10 }}>
                {ctxErreur} <button type="button" style={bouton} onClick={charger}>Réessayer</button>
              </div>
            )}
            {!ctx && !ctxErreur && <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Chargement {voc.du('article', true)}…</p>}
            {ctx && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <strong style={{ fontSize: '0.86rem' }}>{lignes.length} ligne{lignes.length > 1 ? 's' : ''}</strong>
                  {!lu.lignesFacture.length && <span style={{ fontSize: '0.76rem', color: '#9a3412' }}>Aucune ligne n'a pu être lue : saisissez-les en regardant la facture.</span>}
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Cliquez une ligne pour l'encadrer sur la facture.</span>
                  <div style={{ flex: 1 }} />
                  {aConfirmerIdx.length > 0 && (
                    <button type="button" style={{ ...bouton, color: '#92400e', borderColor: '#fcd34d', background: '#fffbeb' }}
                      onClick={() => setLignes((ls) => ls.map((l) => (l.choix && l.etat === 'proposee' ? { ...l, etat: 'confirmee' } : l)))}>
                      {aConfirmerIdx.length > 1 ? `✓ Confirmer les ${aConfirmerIdx.length} propositions` : '✓ Confirmer la proposition'}
                    </button>
                  )}
                </div>

                {lignes.map((l, i) => {
                  const v = valeurs[i];
                  const e = ETATS[l.etat];
                  const controle = v.q !== null && v.p !== null && v.m !== null ? Math.abs(v.q * v.p * (1 - v.r / 100) - v.m) <= Math.max(tolerance, Math.abs(v.m) * 0.00002) : null;
                  const prixStock = v.article ? calcul.prixStock[i] : null;
                  const ecart = v.article ? ecartDePrix(prixStock, dernierPrix.get(v.article.id) ?? null) : null;
                  const classes = probables ? probables(l.designation) : [];
                  const dejaAchetes = classes.some((a) => achetes.has(a.id));
                  return (
                    // Un clic, ou le focus clavier dans un de ses champs, choisit la ligne (encadrée sur la facture).
                    <div key={l.id} onClick={() => choisirLigne(i)} onFocusCapture={() => { if (choisie !== i) choisirLigne(i); }}
                      style={{ border: `1.5px solid ${choisie === i ? accent : '#e2e8f0'}`, borderRadius: 10, padding: '8px 10px', marginBottom: 8, background: choisie === i ? `${accent}08` : '#fff', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b' }}>{i + 1}</span>
                        <span style={{ padding: '1px 8px', borderRadius: 10, fontSize: '0.66rem', fontWeight: 800, background: v.horsStock ? '#e0e7ff' : e.fond, color: v.horsStock ? '#3730a3' : e.texte }}>
                          {v.horsStock && l.etat !== 'proposee' ? `hors ${voc.nom('stock')}` : e.libelle}
                        </span>
                        {l.raison && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{l.raison}</span>}
                        {l.lue?.aRelire && <span style={{ fontSize: '0.68rem', color: '#b45309' }} title="Lecture fragile : relisez cette ligne sur la facture">à relire</span>}
                        <div style={{ flex: 1 }} />
                        {l.etat === 'proposee' && l.choix && (
                          <button type="button" style={{ ...bouton, color: '#166534', borderColor: '#86efac' }} onClick={(ev) => { ev.stopPropagation(); modifier(i, {}); }}>✓ Confirmer</button>
                        )}
                        <button type="button" style={{ ...bouton, color: '#991b1b' }} title="Retirer cette ligne (elle n'est pas enregistrée)"
                          onClick={(ev) => { ev.stopPropagation(); setModifiee(true); setChoisie(null); setLignes((ls) => ls.filter((x) => x.id !== l.id)); }}>Retirer</button>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                        <label style={{ flex: '3 1 220px' }}><span style={etiquette}>Désignation lue</span>
                          <input style={{ ...petit, width: '100%' }} value={l.designation} onChange={(ev) => modifier(i, { designation: ev.target.value }, false)} /></label>
                        <label style={{ flex: '1 1 110px' }} title={`Colonne « Réf. » ou « Code » de la facture ${voc.du('fournisseur')} : ce code reconnaît la ligne la fois suivante`}>
                          <span style={etiquette}>Code {voc.nom('fournisseur')}</span>
                          <input style={{ ...petit, width: '100%' }} value={l.reference} onChange={(ev) => modifier(i, { reference: ev.target.value }, false)} /></label>
                      </div>
                      <div className="vf-ligne-num" style={{ marginBottom: 6 }}>
                        <label><span style={etiquette}>Quantité</span><input style={{ ...petit, width: '100%' }} inputMode="decimal" value={l.quantite} onChange={(ev) => modifier(i, { quantite: ev.target.value }, false)} /></label>
                        <label><span style={etiquette}>Unité</span><input style={{ ...petit, width: '100%' }} value={l.unite} onChange={(ev) => modifier(i, { unite: ev.target.value }, false)} /></label>
                        <label><span style={etiquette}>Prix HT</span><input style={{ ...petit, width: '100%' }} inputMode="decimal" value={l.prix} onChange={(ev) => modifier(i, { prix: ev.target.value }, false)} /></label>
                        <label><span style={etiquette}>Remise %</span><input style={{ ...petit, width: '100%' }} inputMode="decimal" value={l.remise} onChange={(ev) => modifier(i, { remise: ev.target.value }, false)} /></label>
                        <label><span style={etiquette}>TVA %</span>
                          <input style={{ ...petit, width: '100%', borderColor: v.t === null ? '#f87171' : '#cbd5e1' }} inputMode="decimal" value={l.tva} placeholder="?" onChange={(ev) => modifier(i, { tva: ev.target.value }, false)} /></label>
                        <label><span style={etiquette}>Montant HT {controle === true ? <span style={{ color: '#15803d' }} title="quantité × prix − remise = montant" aria-label="calcul juste">✓</span> : controle === false ? <span style={{ color: '#b45309' }} title="quantité × prix − remise ≠ montant : relisez" aria-label="calcul faux, à relire">⚠</span> : null}</span>
                          <input style={{ ...petit, width: '100%', fontWeight: 700 }} inputMode="decimal" value={l.montant} onChange={(ev) => modifier(i, { montant: ev.target.value }, false)} /></label>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }} onClick={(ev) => ev.stopPropagation()}>
                        <div style={{ flex: '2 1 220px' }}><span style={etiquette}>{voc.Nom('article')} LabFlow</span>
                          <ChoixArticle valeur={l.choix} articles={classes} natures={NATURES} manquant={!l.choix}
                            onChoix={(choix) => choisir(i, choix)} libelles={libellesChoix}
                            groupeDe={(a) => (achetes.has(a.id) ? groupeAchetes : dejaAchetes ? groupeAutres : undefined)}
                            noteDe={(a) => (a.selectionne ? undefined : horsDuLieu)} />
                        </div>
                        {v.article && (
                          <label style={{ flex: '1 1 210px' }}><span style={etiquette}>Conversion {l.conversionSure ? '' : <span style={{ color: '#b45309', textTransform: 'none' }}>(à vérifier)</span>}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem' }}>
                              1 {l.unite || 'unité'} =
                              <input style={{ ...petit, width: 70, borderColor: v.conv !== null && v.conv > 0 && l.conversionSure ? '#cbd5e1' : '#f87171' }} inputMode="decimal" value={l.conversion} onChange={(ev) => modifier(i, { conversion: ev.target.value, conversionSure: true })} />
                              {v.article.unite}
                              {!l.conversionSure && (
                                <button type="button" style={{ ...bouton, color: '#166534', borderColor: '#86efac', marginLeft: 4 }} onClick={() => modifier(i, { conversionSure: true }, false)}>✓ Conversion juste</button>
                              )}
                            </span>
                          </label>
                        )}
                        {!l.choix && !l.creation && (
                          <button type="button" style={{ ...bouton, color: accent }} onClick={() => void ouvrirCreation(i)}>+ Créer {voc.le('article')}</button>
                        )}
                      </div>
                      {v.article && v.q !== null && v.conv !== null && v.conv > 0 && (
                        <div style={{ fontSize: '0.74rem', color: '#334155', marginTop: 4 }}>
                          → en {voc.nom('stock')} : <strong>{fNb(Math.round(v.q * v.conv * 1000) / 1000)} {v.article.unite}</strong>
                          {prixStock !== null && <> à <strong>{f3(prixStock)}</strong> DT HT / {v.article.unite}</>}
                          {!v.article.selectionne && <span style={{ color: 'var(--text-muted)' }}> · {voc.acc('article', 'ajouté', 'ajoutée')} {cible.type === 'activite' ? `à ${voc.ce('activite')}` : `à ${voc.ce('labo')}`}</span>}
                          {ecart !== null && Math.abs(ecart) > 30 && (
                            <span style={{ color: '#b45309' }}> · ⚠ prix {ecart > 0 ? '+' : ''}{String(ecart).replace('.', ',')} % par rapport au dernier achat ({f3(dernierPrix.get(v.article.id) ?? null)})</span>
                          )}
                        </div>
                      )}
                      {l.creation && (
                        <div onClick={(ev) => ev.stopPropagation()} style={{ marginTop: 6, padding: 8, border: '1px dashed #cbd5e1', borderRadius: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                          <label style={{ flex: '2 1 180px' }}><span style={etiquette}>Nom {voc.du('article')}</span>
                            <input style={{ ...petit, width: '100%' }} value={l.creation.nom} maxLength={100} onChange={(ev) => modifier(i, { creation: { ...l.creation!, nom: ev.target.value } }, false)} /></label>
                          <label style={{ flex: '1 1 110px' }}><span style={etiquette}>Unité ({voc.nom('stock')})</span>
                            <select style={{ ...petit, width: '100%' }} value={l.creation.uniteId} onChange={(ev) => modifier(i, { creation: { ...l.creation!, uniteId: ev.target.value } }, false)}>
                              <option value="">—</option>
                              {(unites ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                            </select></label>
                          <label style={{ flex: '1 1 140px' }}><span style={etiquette}>Catégorie</span>
                            <select style={{ ...petit, width: '100%' }} value={l.creation.categorieId} onChange={(ev) => modifier(i, { creation: { ...l.creation!, categorieId: ev.target.value } }, false)}>
                              <option value="">Sans catégorie</option>
                              {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.familleName ? `${c.familleName} › ${c.name}` : c.name}</option>)}
                            </select></label>
                          <button type="button" style={{ ...bouton, color: '#fff', background: accent, borderColor: accent }} disabled={!l.creation.nom.trim() || !l.creation.uniteId || l.creation.enCours} onClick={() => void creerArticle(i)}>
                            {l.creation.enCours ? '…' : 'Créer'}
                          </button>
                          <button type="button" style={bouton} onClick={() => modifier(i, { creation: null }, false)}>Annuler</button>
                          {l.creation.erreur && <span style={{ flexBasis: '100%', fontSize: '0.74rem', color: '#991b1b' }}>{l.creation.erreur}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
                <button type="button" style={{ ...bouton, marginBottom: 12 }} onClick={ajouterLigne}>+ Ajouter une ligne</button>

                {lignesEnTtc && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 10px', fontSize: '0.78rem', marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    ⚠ La somme des lignes égale le TTC de la facture : ses prix sont sans doute <strong>TTC</strong> (ticket de grande surface).
                    <button type="button" style={bouton} onClick={ramenerEnHt}>Ramener les lignes en HT</button>
                  </div>
                )}
                {/* Pied : totaux lus et recalculés */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                    <label><span style={etiquette}>Remise globale (pied)</span>
                      <input style={{ ...petit, width: 110 }} inputMode="decimal" value={remiseGlobale} placeholder="0,000" onChange={(ev) => { setModifiee(true); setRemiseGlobale(ev.target.value); }} /></label>
                    <label><span style={etiquette}>FODEC</span>
                      <input style={{ ...petit, width: 110 }} inputMode="decimal" value={fodec} placeholder="0,000" onChange={(ev) => { setModifiee(true); setFodec(ev.target.value); }} /></label>
                    <label><span style={etiquette}>Timbre fiscal</span>
                      <select style={{ ...petit, width: 110 }} value={String(timbre)} onChange={(ev) => { setModifiee(true); setTimbre(Number(ev.target.value)); }}>
                        {TIMBRES.map((x) => <option key={x} value={x}>{x === 0 ? 'Aucun' : `${String(x).replace('.', ',')} DT`}</option>)}
                      </select></label>
                  </div>
                  <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: '#64748b', fontSize: '0.7rem', textAlign: 'right' }}><th style={{ textAlign: 'left' }} /><th>Lu sur la facture</th><th>Recalculé</th><th /></tr>
                    </thead>
                    <tbody style={{ textAlign: 'right' }}>
                      <tr><td style={{ textAlign: 'left' }}>Somme des lignes</td><td /><td>{f3(sommeLignes)}</td><td /></tr>
                      <tr><td style={{ textAlign: 'left' }}>Total HT</td><td>{f3(t.ht)}</td><td>{f3(calcul.ht)}</td><td>{marque(comparer(t.ht, calcul.ht))}</td></tr>
                      {(t.fodec !== null || calcul.fodec > 0) && <tr><td style={{ textAlign: 'left' }}>FODEC</td><td>{f3(t.fodec)}</td><td>{f3(calcul.fodec)}</td><td>{marque(comparer(t.fodec, calcul.fodec))}</td></tr>}
                      <tr><td style={{ textAlign: 'left' }}>TVA {calcul.parTaux.filter((x) => x.taux > 0).map((x) => `${String(x.taux).replace('.', ',')} %`).join(', ')}</td><td>{f3(t.tva)}</td><td>{f3(calcul.tva)}</td><td>{marque(comparer(t.tva, calcul.tva))}</td></tr>
                      <tr><td style={{ textAlign: 'left' }}>Timbre</td><td>{t.timbre === 0 ? 'aucun' : f3(t.timbre)}</td><td>{timbre === 0 ? 'aucun' : f3(timbre)}</td><td>{marque(comparer(t.timbre, timbre))}</td></tr>
                      <tr style={{ fontWeight: 800 }}><td style={{ textAlign: 'left' }}>Total TTC</td><td>{f3(t.ttc)}</td><td>{f3(calcul.ttc)}</td><td>{marque(comparer(t.ttc, calcul.ttc))}</td></tr>
                    </tbody>
                  </table>
                  {comparer(t.ttc, calcul.ttc) === false && (
                    <p style={{ fontSize: '0.74rem', color: '#92400e', margin: '6px 0 0' }}>⚠ Le TTC recalculé diffère du TTC lu : relisez les lignes (quantités, montants, TVA) et le pied. Vous pouvez enregistrer quand même.</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Bas : validation */}
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220, fontSize: '0.76rem' }}>
            {erreur && <div style={{ color: '#991b1b', fontWeight: 700 }}>{erreur}</div>}
            {!erreur && blocages.length > 0 && <div style={{ color: '#92400e' }}>Avant de valider : {blocages.join(' ; ')}.</div>}
            {!erreur && !blocages.length && (
              <div style={{ color: '#334155' }}>
                {nbStock} ligne{nbStock > 1 ? 's' : ''} en {voc.nom('stock')}{lignes.length - nbStock ? `, ${lignes.length - nbStock} hors ${voc.nom('stock')}` : ''} · la pièce ({fichiers.length} fichier{fichiers.length > 1 ? 's' : ''}) est jointe · la facture ne sera plus modifiable, seulement supprimable en entier.
              </div>
            )}
          </div>
          {comptaActif === true && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
              title="LabFlow prépare l'écriture d'achat en brouillard dans LabFlow Compta ; votre comptable la vérifie et la valide.">
              <input type="checkbox" checked={envoyerCompta} onChange={(e) => setEnvoyerCompta(e.target.checked)} disabled={envoi} />
              Envoyer à la comptabilité
            </label>
          )}
          <button type="button" style={bouton} onClick={() => void fermer()} disabled={envoi}>Abandonner</button>
          <button type="button" onClick={() => void valider()} disabled={blocages.length > 0 || envoi || Boolean(relecture)}
            style={{ ...bouton, padding: '8px 16px', fontSize: '0.84rem', color: '#fff', border: 'none', background: blocages.length || envoi ? '#94a3b8' : `linear-gradient(135deg, ${accent}, #2563eb)`, cursor: blocages.length || envoi ? 'not-allowed' : 'pointer' }}>
            {envoi ? 'Enregistrement…' : `Valider et enregistrer (${calcul.ttc.toFixed(3).replace('.', ',')} DT TTC)`}
          </button>
        </div>
      </div>
    </div>
  );
}
