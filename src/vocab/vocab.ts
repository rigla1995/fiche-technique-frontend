// Moteur de vocabulaire (lot 2, spec §2.1) — UNE seule grammaire pour tout le produit.
// `creerVocab(lexique)` rend les termes du domaine du compte avec leurs accords
// (article, élision, genre, nombre, casse). Avec le lexique par défaut, chaque forme
// rendue est celle de l'application d'origine (restauration).
//
// SOURCE UNIQUE : ce fichier est recopié dans le backend (`src/utils/vocab.js`) par
// `node scripts/sync-vocab-back.mjs`. Module PUR : aucun import d'exécution hors `./`,
// syntaxe TypeScript effaçable uniquement (Node l'exécute tel quel).
//
// Arguments communs :
//   k : clé du lexique (littérale) ;
//   n : nombre (pluriel si n >= 2) ou booléen (true = pluriel) ou absent (singulier) ;
//   c : casse du nom — 'nom' (défaut, minuscules) | 'Nom' (forme stockée) | 'Titre' ;
//       'court' | 'Court' : même chose sur la forme courte (« d'appro », « l'Appro »).
// Exemples de saisie : `voc.ex(parDefaut, sinon)` rend l'exemple d'origine tant que le lexique du compte est
// le lexique par défaut (`voc.estDefaut`), et l'exemple neutre construit pour les autres domaines.
// Apostrophe droite. Clé inconnue → « ‹clé› » + console.warn, jamais d'exception.

import { LEXIQUE_DEFAUT } from './lexiqueDefaut.ts';
import type { CleLexique, EntreeLexique, Genre, Lexique } from './lexiqueDefaut.ts';
import { rendre } from './rendre.ts';

export type { CleLexique, EntreeLexique, Genre, Lexique } from './lexiqueDefaut.ts';

export type Nombre = number | boolean | null | undefined;
export type Casse = 'nom' | 'Nom' | 'Titre' | 'court' | 'Court';
/** Déterminant de `tous` ; '' = sans déterminant (« tous prestataires », « toutes activités »). */
export type DetTous = 'les' | 'vos' | 'ces' | 'mes' | '';
/** Déterminants que `det` sait rendre seuls (les mêmes que les méthodes `le`, `un`, `du`…). */
export type NomDeterminant = 'le' | 'un' | 'du' | 'de' | 'au' | 'ce' | 'aucun' | 'votre' | 'mon' | 'son' | 'nouveau';

export interface VocabDe<K extends string> {
  /** Toutes les initiales en minuscule, sauf mots-sigles : « labo », « produit vendable », « PT ». */
  nom(k: K, n?: Nombre): string;
  /** Forme stockée telle quelle : « Labo », « Produit vendable ». */
  Nom(k: K, n?: Nombre): string;
  /** Majuscule à chaque mot sauf mots-outils : « Produits Vendables », « Fiche de Coût de Revient ». */
  Titre(k: K, n?: Nombre): string;
  /** Capitales : « LABO » ; `c` = 'court' | 'Court' → capitales de la forme courte (« CUISINE »). */
  MAJ(k: K, n?: Nombre, c?: Casse): string;
  /** Alias de `nom(k, true)`. */
  pl(k: K): string;
  /** Alias de `Nom(k, true)`. */
  Pl(k: K): string;
  /** Forme courte en minuscules (sigles conservés) : « PT », « labo », « appro ». */
  court(k: K, n?: Nombre): string;
  /** Forme courte stockée : « PT », « Labo », « Appro ». */
  Court(k: K, n?: Nombre): string;
  /**
   * Pluriel typographique mot à mot : « labo(s) », « produit(s) vendable(s) » ; irrégulier : « sg/pl ».
   * `c` = 'court' | 'Court' → sur la forme courte (« cuisine(s) » au lieu de « cuisine(s) centrale(s) »).
   */
  nomS(k: K, c?: Casse): string;
  NomS(k: K, c?: Casse): string;
  /** `String(n) + ' ' + nom(k, n)` : « 3 labos ». */
  n(k: K, n: number): string;
  /** Complément du nom en phrase : apposition (« stock labo ») sinon `du` (« de la cuisine centrale »). */
  compl(k: K, n?: Nombre): string;
  /** « nom (court) » : « produits transformés (PT) » ; sans parenthèse si les deux formes sont égales. */
  avecCourt(k: K, n?: Nombre): string;
  /** le labo · l'activité · les labos */
  le(k: K, n?: Nombre, c?: Casse): string;
  Le(k: K, n?: Nombre, c?: Casse): string;
  /** un labo · une activité · des labos */
  un(k: K, n?: Nombre, c?: Casse): string;
  Un(k: K, n?: Nombre, c?: Casse): string;
  /** du labo · de l'activité · de la vente · des labos */
  du(k: K, n?: Nombre, c?: Casse): string;
  Du(k: K, n?: Nombre, c?: Casse): string;
  /** de labo · d'activité · d'activités */
  de(k: K, n?: Nombre, c?: Casse): string;
  De(k: K, n?: Nombre, c?: Casse): string;
  /** au labo · à l'activité · aux labos */
  au(k: K, n?: Nombre, c?: Casse): string;
  Au(k: K, n?: Nombre, c?: Casse): string;
  /** ce labo · cet article · cette activité · ces labos */
  ce(k: K, n?: Nombre, c?: Casse): string;
  Ce(k: K, n?: Nombre, c?: Casse): string;
  /** aucun labo · aucune activité (singulier seulement) */
  aucun(k: K, c?: Casse): string;
  Aucun(k: K, c?: Casse): string;
  /** votre labo · vos labos */
  votre(k: K, n?: Nombre, c?: Casse): string;
  Votre(k: K, n?: Nombre, c?: Casse): string;
  /** mon labo · mon activité · ma vente · mes labos */
  mon(k: K, n?: Nombre, c?: Casse): string;
  Mon(k: K, n?: Nombre, c?: Casse): string;
  /** son labo · son activité · sa vente · ses labos */
  son(k: K, n?: Nombre, c?: Casse): string;
  Son(k: K, n?: Nombre, c?: Casse): string;
  /** nouveau labo · nouvel article · nouvelle activité · nouveaux labos · nouvelles activités */
  nouveau(k: K, n?: Nombre, c?: Casse): string;
  Nouveau(k: K, n?: Nombre, c?: Casse): string;
  /** tous les labos · toutes vos activités · tous prestataires avec det = '' (toujours pluriel) */
  tous(k: K, det?: DetTous, c?: Casse): string;
  Tous(k: K, det?: DetTous, c?: Casse): string;
  /**
   * Déterminant SEUL, suivi de son séparateur : « du␣ », « de la␣ », « de l' », « des␣ ». Pour un terme séparé
   * de son déterminant par une balise : `{voc.det('stock', 'du')}<strong>{voc.nom('stock')}</strong>`.
   * `c` = 'court' | 'Court' quand le nom qui suit est la forme courte (son élision peut différer).
   */
  det(k: K, d: NomDeterminant, n?: Nombre, c?: Casse): string;
  Det(k: K, d: NomDeterminant, n?: Nombre, c?: Casse): string;
  /** Forme accordée en genre ; au pluriel ajoute « s » sauf finale s, x, z. */
  acc(k: K, masc: string, fem: string, n?: Nombre): string;
  /**
   * Accord avec PLUSIEURS termes coordonnés (« activités & labos assignés », « aucune activité ni labo
   * configuré ») : féminin seulement si TOUS les termes sont féminins, masculin sinon. Même règle de
   * pluriel que `acc`.
   */
  accN(cles: readonly K[], masc: string, fem: string, n?: Nombre): string;
  /** Genre de l'entrée. */
  g(k: K): Genre;
  /** Icône de l'entrée ('' si absente). */
  icon(k: K): string;
  /**
   * Vrai quand le lexique du compte donne exactement les rendus du lexique par défaut (formes, genre, élision,
   * icône, forme courte, apposition) : restauration, café, boulangerie, admin, non connecté. Une clé en plus
   * (inconnue du lexique par défaut) ne change aucun rendu : elle ne compte pas.
   */
  readonly estDefaut: boolean;
  /**
   * Exemple de saisie : `parDefaut` (l'exemple d'origine, propre à la restauration) si `estDefaut`, sinon
   * `sinon` (l'exemple neutre, construit avec le vocabulaire du compte) — par exemple
   * voc.ex('Ex: Poulet entier', `Ex: ${voc.Nom('article')} A`). Balise : [[ex:clé:texte par défaut]].
   */
  ex(parDefaut: string, sinon: string): string;
  /** Mini-vocabulaire à une entrée, de clé '_' : `voc.avec({ sg, pl, g, el }).mon('_')`. */
  avec(entree: EntreeLexique): VocabDe<'_'>;
}

/** Vocabulaire d'un compte : les clés sont celles du lexique par défaut. */
export type Vocab = VocabDe<CleLexique>;

// ── Casse ────────────────────────────────────────────────────────────────────

// Mot-sigle : 2 majuscules en tête, ou majuscule + chiffre (« PT », « B2B », « FCR »).
const SIGLE = /^(?:\p{Lu}{2}|\p{Lu}\d)/u;
// Un « mot » pour la mise en minuscules : tout ce qui n'est ni blanc, ni tiret, ni apostrophe, ni barre.
const MOT = /[^\s\-'’/]+/g;
// Mots-outils laissés en minuscules par Titre (sauf en tête).
const MOTS_OUTILS = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'et', 'à', 'au', 'aux', 'en',
  'par', 'pour', 'sur', 'sans', 'avec', 'ou', 'un', 'une',
]);
const ELIDE = /^([dl])(['’])(.+)$/i;

const majuscule = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const minuscules = (forme: string): string =>
  forme.replace(MOT, (mot) => (SIGLE.test(mot) ? mot : mot.charAt(0).toLowerCase() + mot.slice(1)));

const titre = (forme: string): string =>
  forme
    .split(' ')
    .map((mot, i) => {
      if (!mot) return mot;
      const bas = mot.toLowerCase();
      if (i > 0 && MOTS_OUTILS.has(bas)) return bas;
      const elide = ELIDE.exec(mot);
      if (elide) {
        const tete = i > 0 ? elide[1].toLowerCase() : elide[1].toUpperCase();
        return tete + elide[2] + majuscule(elide[3]);
      }
      return majuscule(mot);
    })
    .join(' ');

// ── Entrées ──────────────────────────────────────────────────────────────────

interface EntreeNorm {
  sg: string;
  pl: string;
  g: Genre;
  el: boolean;
  icon: string;
  appo: boolean;
  courtSg: string;
  courtPl: string;
  courtEl: boolean;
  inconnue: boolean;
}

const objet = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const texte = (v: unknown): string => (typeof v === 'string' ? v : '');

const aUnSg = (v: unknown): boolean => texte(objet(v).sg).trim() !== '';

// Copie d'une entrée (forme courte comprise) : jamais d'objet partagé avec le défaut gelé.
const copier = (e: EntreeLexique): EntreeLexique =>
  (e.court && typeof e.court === 'object' ? { ...e, court: { ...e.court } } : { ...e });

// Entrée incomplète tolérée : pl = sg, g = 'm', el = false ; forme courte absente → sg / pl.
const normaliser = (brut: unknown): EntreeNorm | null => {
  const e = objet(brut);
  const sg = texte(e.sg);
  if (!sg.trim()) return null;
  const pl = texte(e.pl) || sg;
  const el = e.el === true;
  const c = objet(e.court);
  const courtSg = texte(c.sg);
  return {
    sg,
    pl,
    g: e.g === 'f' ? 'f' : 'm',
    el,
    icon: texte(e.icon),
    appo: e.appo === true,
    courtSg: courtSg || sg,
    courtPl: courtSg ? texte(c.pl) || courtSg : pl,
    courtEl: courtSg && typeof c.el === 'boolean' ? c.el : el,
    inconnue: false,
  };
};

const entreeInconnue = (k: string): EntreeNorm => {
  const forme = `‹${k}›`;
  return { sg: forme, pl: forme, g: 'm', el: false, icon: '', appo: false, courtSg: forme, courtPl: forme, courtEl: false, inconnue: true };
};

const estPluriel = (n: Nombre): boolean => (typeof n === 'boolean' ? n : Number(n) >= 2);

const estCourte = (c: Casse | undefined): boolean => c === 'court' || c === 'Court';

// Forme du nom dans la casse demandée.
const forme = (e: EntreeNorm, pluriel: boolean, c: Casse | undefined): string => {
  const base = estCourte(c) ? (pluriel ? e.courtPl : e.courtSg) : pluriel ? e.pl : e.sg;
  if (e.inconnue) return base;
  if (c === 'Nom' || c === 'Court') return base;
  if (c === 'Titre') return titre(base);
  return minuscules(base);
};

// ── Déterminants ─────────────────────────────────────────────────────────────
// m / f : devant consonne ; me / fe : devant voyelle ou h muet (el) ; pm / pf : pluriel ;
// pe : pluriel élidé (seulement « d' »). Une forme finissant par une apostrophe se colle au nom.
interface Determinant {
  m: string;
  f: string;
  me: string;
  fe: string;
  pm: string;
  pf: string;
  pe?: string;
}

const det = (m: string, f: string, me: string, fe: string, pm: string, pf: string = pm, pe?: string): Determinant =>
  ({ m, f, me, fe, pm, pf, pe });

const DETERMINANTS = {
  le: det('le', 'la', "l'", "l'", 'les'),
  un: det('un', 'une', 'un', 'une', 'des'),
  du: det('du', 'de la', "de l'", "de l'", 'des'),
  de: det('de', 'de', "d'", "d'", 'de', 'de', "d'"),
  au: det('au', 'à la', "à l'", "à l'", 'aux'),
  ce: det('ce', 'cette', 'cet', 'cette', 'ces'),
  aucun: det('aucun', 'aucune', 'aucun', 'aucune', 'aucun', 'aucune'),
  votre: det('votre', 'votre', 'votre', 'votre', 'vos'),
  mon: det('mon', 'ma', 'mon', 'mon', 'mes'),
  son: det('son', 'sa', 'son', 'son', 'ses'),
  nouveau: det('nouveau', 'nouvelle', 'nouvel', 'nouvelle', 'nouveaux', 'nouvelles'),
};

const coller = (d: string, nom: string): string => (d.endsWith("'") ? d + nom : `${d} ${nom}`);

// Forme du déterminant devant le nom de l'entrée (genre, nombre, élision de la forme longue ou courte).
const formeDeterminant = (d: Determinant, e: EntreeNorm, pluriel: boolean, c: Casse | undefined): string => {
  const el = estCourte(c) ? e.courtEl : e.el;
  if (pluriel) return (el && d.pe) || (e.g === 'f' ? d.pf : d.pm);
  if (e.g === 'f') return el ? d.fe : d.f;
  return el ? d.me : d.m;
};

const avecDeterminant = (d: Determinant, e: EntreeNorm, pluriel: boolean, c: Casse | undefined): string =>
  coller(formeDeterminant(d, e, pluriel, c), forme(e, pluriel, c));

// Déterminant seul, prêt à recevoir le nom : une espace le suit, sauf après une apostrophe.
const determinantSeul = (d: Determinant, e: EntreeNorm, pluriel: boolean, c: Casse | undefined): string => {
  const f = formeDeterminant(d, e, pluriel, c);
  return f.endsWith("'") ? f : `${f} `;
};

// Forme accordée (masculin ou féminin) ; au pluriel ajoute « s » sauf finale s, x, z.
const accorder = (feminin: boolean, masc: string, fem: string, n: Nombre): string => {
  const accorde = String((feminin ? fem : masc) ?? '');
  return estPluriel(n) && !/[sxz]$/i.test(accorde) ? `${accorde}s` : accorde;
};

// Pluriel typographique mot à mot (« produit(s) vendable(s) ») ; irrégulier → « sg/pl ».
const plurielTypographique = (sg: string, pl: string): string => {
  if (sg === pl) return sg;
  const ms = sg.split(' ');
  const mp = pl.split(' ');
  if (ms.length !== mp.length) return `${sg}/${pl}`;
  const mots: string[] = [];
  for (let i = 0; i < ms.length; i += 1) {
    if (mp[i] === ms[i]) mots.push(ms[i]);
    else if (ms[i] && mp[i].startsWith(ms[i])) mots.push(`${ms[i]}(${mp[i].slice(ms[i].length)})`);
    else return `${sg}/${pl}`;
  }
  return mots.join(' ');
};

// ── Le moteur ────────────────────────────────────────────────────────────────

// `estDefaut` : le lexique est-il celui par défaut ? Décidé par l'appelant (creerVocab) ; un mini-vocabulaire
// (voc.avec) hérite de celui du vocabulaire qui le crée.
function construire<K extends string>(lexique: unknown, estDefaut: boolean = false): VocabDe<K> {
  const source = objet(lexique);
  const table = new Map<string, EntreeNorm>();
  for (const k of Object.keys(source)) {
    const e = normaliser(source[k]);
    if (e) table.set(k, e);
  }
  // Signalements déjà faits : une fois par clé. Borné (vidé au-delà de 500) : au serveur, un texte rendu peut
  // interpoler une donnée saisie de la forme d'une balise (« [[nom:xyz]] »), et l'ensemble vit tout le processus.
  const signalees = new Set<string>();

  const entree = (k: string): EntreeNorm => {
    const cle = String(k);
    const e = table.get(cle);
    if (e) return e;
    if (!signalees.has(cle)) {
      if (signalees.size >= 500) signalees.clear();
      signalees.add(cle);
      console.warn(`[vocab] clé de lexique inconnue : « ${cle} »`);
    }
    return entreeInconnue(cle);
  };

  const determine = (d: Determinant) => (k: K, n?: Nombre, c?: Casse): string =>
    avecDeterminant(d, entree(k), estPluriel(n), c);
  const Determine = (d: Determinant) => (k: K, n?: Nombre, c?: Casse): string =>
    majuscule(avecDeterminant(d, entree(k), estPluriel(n), c));

  const tous = (k: K, d: DetTous = 'les', c?: Casse): string => {
    const e = entree(k);
    const quantifieur = e.g === 'f' ? 'toutes' : 'tous';
    const nom = forme(e, true, c);
    return d ? `${quantifieur} ${d} ${nom}` : `${quantifieur} ${nom}`;
  };

  const seul = (k: K, d: NomDeterminant, n?: Nombre, c?: Casse): string => {
    const nomDet = String(d);
    if (!Object.prototype.hasOwnProperty.call(DETERMINANTS, nomDet)) {
      if (!signalees.has(`det:${nomDet}`)) {
        signalees.add(`det:${nomDet}`);
        console.warn(`[vocab] déterminant inconnu : « ${nomDet} »`);
      }
      return '';
    }
    return determinantSeul(DETERMINANTS[nomDet as NomDeterminant], entree(k), estPluriel(n), c);
  };

  const voc: VocabDe<K> = {
    nom: (k, n) => forme(entree(k), estPluriel(n), 'nom'),
    Nom: (k, n) => forme(entree(k), estPluriel(n), 'Nom'),
    Titre: (k, n) => forme(entree(k), estPluriel(n), 'Titre'),
    MAJ: (k, n, c) => {
      const e = entree(k);
      const stockee = forme(e, estPluriel(n), estCourte(c) ? 'Court' : 'Nom');
      return e.inconnue ? stockee : stockee.toUpperCase();
    },
    pl: (k) => forme(entree(k), true, 'nom'),
    Pl: (k) => forme(entree(k), true, 'Nom'),
    court: (k, n) => forme(entree(k), estPluriel(n), 'court'),
    Court: (k, n) => forme(entree(k), estPluriel(n), 'Court'),
    nomS: (k, c) => {
      const e = entree(k);
      if (e.inconnue) return e.sg;
      return minuscules(estCourte(c) ? plurielTypographique(e.courtSg, e.courtPl) : plurielTypographique(e.sg, e.pl));
    },
    NomS: (k, c) => {
      const e = entree(k);
      return estCourte(c) ? plurielTypographique(e.courtSg, e.courtPl) : plurielTypographique(e.sg, e.pl);
    },
    n: (k, n) => `${String(n)} ${forme(entree(k), estPluriel(n), 'nom')}`,
    compl: (k, n) => {
      const e = entree(k);
      const pluriel = estPluriel(n);
      return e.appo ? forme(e, pluriel, 'nom') : avecDeterminant(DETERMINANTS.du, e, pluriel, 'nom');
    },
    avecCourt: (k, n) => {
      const e = entree(k);
      const pluriel = estPluriel(n);
      const long = forme(e, pluriel, 'nom');
      const court = forme(e, pluriel, 'court');
      return (pluriel ? e.pl === e.courtPl : e.sg === e.courtSg) ? long : `${long} (${court})`;
    },
    le: determine(DETERMINANTS.le),
    Le: Determine(DETERMINANTS.le),
    un: determine(DETERMINANTS.un),
    Un: Determine(DETERMINANTS.un),
    du: determine(DETERMINANTS.du),
    Du: Determine(DETERMINANTS.du),
    de: determine(DETERMINANTS.de),
    De: Determine(DETERMINANTS.de),
    au: determine(DETERMINANTS.au),
    Au: Determine(DETERMINANTS.au),
    ce: determine(DETERMINANTS.ce),
    Ce: Determine(DETERMINANTS.ce),
    aucun: (k, c) => avecDeterminant(DETERMINANTS.aucun, entree(k), false, c),
    Aucun: (k, c) => majuscule(avecDeterminant(DETERMINANTS.aucun, entree(k), false, c)),
    votre: determine(DETERMINANTS.votre),
    Votre: Determine(DETERMINANTS.votre),
    mon: determine(DETERMINANTS.mon),
    Mon: Determine(DETERMINANTS.mon),
    son: determine(DETERMINANTS.son),
    Son: Determine(DETERMINANTS.son),
    nouveau: determine(DETERMINANTS.nouveau),
    Nouveau: Determine(DETERMINANTS.nouveau),
    tous,
    Tous: (k, d, c) => majuscule(tous(k, d, c)),
    det: seul,
    Det: (k, d, n, c) => majuscule(seul(k, d, n, c)),
    acc: (k, masc, fem, n) => accorder(entree(k).g === 'f', masc, fem, n),
    accN: (cles, masc, fem, n) => {
      const liste: readonly K[] = Array.isArray(cles) ? cles : [cles as unknown as K];
      return accorder(liste.length > 0 && liste.every((k) => entree(k).g === 'f'), masc, fem, n);
    },
    g: (k) => entree(k).g,
    icon: (k) => entree(k).icon,
    estDefaut,
    ex: (parDefaut, sinon) => String((estDefaut ? parDefaut : sinon) ?? ''),
    avec: (e) => construire<'_'>({ _: e }, estDefaut),
  };
  return Object.freeze(voc);
}

// Le lexique `a` donne-t-il, pour CHAQUE clé du lexique `b` (le défaut), le même rendu ? (formes, genre,
// élision, icône, forme courte, apposition). Une clé en plus dans `a` ne compte pas : aucun texte de cette
// version ne la rend (clé ajoutée par un serveur plus récent pendant qu'un écran reste ouvert, clé propre à un
// domaine). Une clé en moins, ou une entrée illisible, est un écart.
const memesRendus = (a: Record<string, unknown>, b: Lexique): boolean =>
  Object.keys(b).every((k) => JSON.stringify(normaliser(a[k])) === JSON.stringify(normaliser(b[k])));

/**
 * Vocabulaire d'un lexique RÉSOLU (toutes les clés présentes ; entrées incomplètes tolérées).
 * `voc.estDefaut` est vrai si ce lexique donne les mêmes rendus que le lexique par défaut.
 */
export function creerVocab(lexique: Lexique | Record<string, unknown> | null | undefined): Vocab {
  return construire<CleLexique>(lexique, memesRendus(objet(lexique), LEXIQUE_DEFAUT));
}

/** Vocabulaire du lexique par défaut (restauration) : admin, boss, non connecté. */
export const vocabDefaut: Vocab = creerVocab(LEXIQUE_DEFAUT);

// ── Résolution d'un lexique de domaine (spec §1.3) ───────────────────────────

const CHAMPS_LIBRES = ['pl', 'g', 'el', 'icon', 'court', 'appo'] as const;

const formeCourte = (v: unknown): EntreeLexique['court'] | undefined => {
  const c = objet(v);
  const sg = texte(c.sg);
  if (!sg.trim()) return undefined;
  const court: NonNullable<EntreeLexique['court']> = { sg, pl: texte(c.pl) || sg };
  if (typeof c.el === 'boolean') court.el = c.el;
  return court;
};

// Pluriel d'une entrée rendue par gabarit : les mots littéraux de tête prennent le pluriel
// du défaut (« Espace Services » → « Espaces Services », comme « Espace Activités » → « Espaces Activités »).
const plurielGabarit = (rendu: string, sgDefaut: string, plDefaut: string): string => {
  let commun = 0;
  while (
    commun < sgDefaut.length && commun < plDefaut.length
    && sgDefaut[sgDefaut.length - 1 - commun] === plDefaut[plDefaut.length - 1 - commun]
  ) commun += 1;
  const teteSg = sgDefaut.slice(0, sgDefaut.length - commun);
  const tetePl = plDefaut.slice(0, plDefaut.length - commun);
  return teteSg && rendu.startsWith(teteSg) ? tetePl + rendu.slice(teteSg.length) : rendu;
};

/**
 * Lexique résolu d'un domaine = défaut + écarts du domaine.
 * - Clé simple : si le domaine surcharge `sg`, l'entrée est celle du domaine (pl = sg, g = 'm',
 *   el = false à défaut ; ni `court` ni `appo` hérités du défaut) ; sinon fusion champ par champ.
 * - Clé dérivée K de parent P : (1) le domaine surcharge K → entrée de K ; (2) sinon, si le
 *   domaine surcharge P : 'copie' → entrée entière de P ; 'pluriel_titre' → sg = pl = Titre(P.pl),
 *   genre et élision de P ; 'gabarit' → gabarit rendu avec le lexique résolu, genre 'm' ;
 *   (3) sinon défaut de K.
 *   « Le domaine surcharge P » = les formes RÉSOLUES de P diffèrent de celles du défaut (formes
 *   longues sg / pl pour 'copie' et 'pluriel_titre' ; longues ou courtes pour 'gabarit') : une
 *   entrée redéclarée à l'identique du défaut ne détache pas ses clés dérivées.
 * - `derive_de`, `mode`, `gabarit` viennent toujours du défaut.
 * - Clés inconnues du défaut : conservées telles quelles.
 */
export function resoudreLexique(defaut: Lexique, ecarts: unknown): Record<string, EntreeLexique> {
  const ov = objet(ecarts);
  const out: Record<string, EntreeLexique> = {};

  const meta = (d: EntreeLexique): Partial<EntreeLexique> => {
    const m: Partial<EntreeLexique> = {};
    if (d.derive_de) m.derive_de = d.derive_de;
    if (d.mode) m.mode = d.mode;
    if (d.gabarit) m.gabarit = d.gabarit;
    return m;
  };

  // Entrée d'une clé d'après le défaut et l'écart du domaine (sans dérivation).
  const fusion = (k: string): EntreeLexique => {
    const d = defaut[k];
    const e = objet(ov[k]);
    if (aUnSg(e)) {
      const sg = texte(e.sg);
      const r: EntreeLexique = { sg, pl: texte(e.pl) || sg, g: e.g === 'f' ? 'f' : 'm', el: e.el === true };
      const icon = texte(e.icon) || d.icon;
      if (icon) r.icon = icon;
      const court = formeCourte(e.court);
      if (court) r.court = court;
      if (e.appo === true) r.appo = true;
      return { ...r, ...meta(d) };
    }
    const r = copier(d) as unknown as Record<string, unknown>;
    for (const champ of CHAMPS_LIBRES) {
      if (e[champ] == null) continue;
      if (champ === 'court') {
        const court = formeCourte(e.court);
        if (court) r.court = court;
      } else if (champ === 'g') {
        if (e.g === 'm' || e.g === 'f') r.g = e.g;
      } else if (champ === 'el' || champ === 'appo') {
        if (typeof e[champ] === 'boolean') r[champ] = e[champ];
      } else if (typeof e[champ] === 'string' && e[champ]) {
        r[champ] = e[champ];
      }
    }
    return r as unknown as EntreeLexique;
  };

  const cles = Object.keys(defaut);
  // 1. Clés simples.
  for (const k of cles) if (!defaut[k].derive_de) out[k] = fusion(k);

  // Formes d'une entrée : longues (sg, pl), et courtes en plus pour les gabarits.
  const longues = (e: EntreeLexique | undefined): string => (e ? `${e.sg}\n${e.pl || e.sg}` : '');
  const formes = (e: EntreeLexique | undefined): string =>
    e ? [e.sg, e.pl, e.court?.sg, e.court?.pl].map((f) => f ?? '').join('\n') : '';

  // 2. Clés dérivées par copie ou pluriel_titre (leur parent est une clé simple).
  const iconDe = (k: string): string => texte(objet(ov[k]).icon) || texte(defaut[k].icon);
  for (const k of cles) {
    const d = defaut[k];
    if (!d.derive_de || d.mode === 'gabarit') continue;
    const p = out[d.derive_de];
    if (aUnSg(ov[k]) || !p || longues(p) === longues(defaut[d.derive_de])) {
      out[k] = fusion(k);
      continue;
    }
    const icon = iconDe(k) || texte(p.icon);
    if (d.mode === 'pluriel_titre') {
      const t = titre(p.pl || p.sg);
      out[k] = { sg: t, pl: t, g: p.g === 'f' ? 'f' : 'm', el: p.el === true, ...(icon ? { icon } : {}), ...meta(d) };
    } else {
      out[k] = { ...copier(p), ...(icon ? { icon } : {}), ...meta(d) };
    }
  }

  // 3. Clés dérivées par gabarit : rendues avec le lexique résolu du domaine.
  const gabarits = cles.filter((k) => defaut[k].derive_de && defaut[k].mode === 'gabarit');
  for (const k of gabarits) out[k] = fusion(k);
  const vocDomaine = construire<string>(out);
  for (const k of gabarits) {
    const d = defaut[k];
    const parent = d.derive_de as string;
    if (aUnSg(ov[k]) || !d.gabarit || formes(out[parent]) === formes(defaut[parent])) continue;
    const sg = rendre(vocDomaine, d.gabarit);
    const icon = iconDe(k);
    out[k] = {
      sg,
      pl: plurielGabarit(sg, d.sg, d.pl || d.sg),
      g: 'm',
      el: d.el === true,
      ...(icon ? { icon } : {}),
      ...meta(d),
    };
  }

  // 4. Ordre des clés du défaut, puis clés inconnues (ajoutées par l'admin), conservées telles quelles.
  const resolu: Record<string, EntreeLexique> = {};
  for (const k of cles) resolu[k] = out[k];
  for (const k of Object.keys(ov)) {
    if (!(k in resolu) && ov[k] && typeof ov[k] === 'object') resolu[k] = copier(ov[k] as EntreeLexique);
  }
  return resolu;
}

// ── Lexique reçu du serveur ──────────────────────────────────────────────────

/**
 * Lexique reçu du serveur, prêt pour `creerVocab`.
 * - Lexique COMPLET (toutes les clés du défaut, chacune avec son `sg`) : il a été résolu par un
 *   serveur du lot 2 — chaque entrée est gardée TELLE QUELLE, pour que l'écran rende exactement
 *   ce que rend le serveur (une entrée redéclarée avec le `sg` du défaut mais sans forme courte
 *   n'a pas de forme courte, d'un côté comme de l'autre).
 * - Lexique INCOMPLET (serveur d'avant le lot 2 pendant un déploiement, lexique partiel) : complété
 *   clé par clé avec le défaut local — clé absente ou sans `sg` → entrée par défaut ; entrée dont
 *   le `sg` est celui du défaut → ses champs manquants (court, appo, …) viennent du défaut ; une
 *   entrée surchargée est gardée telle quelle.
 */
export function completerLexique(defaut: Lexique, recu: unknown): Record<string, EntreeLexique> {
  const src = objet(recu);
  const out: Record<string, EntreeLexique> = {};
  const complet = Object.keys(defaut).every((k) => aUnSg(src[k]));
  for (const k of Object.keys(defaut)) {
    const e = src[k];
    if (!aUnSg(e)) out[k] = copier(defaut[k]);
    else if (!complet && texte(objet(e).sg) === defaut[k].sg) out[k] = copier({ ...defaut[k], ...(e as EntreeLexique) });
    else out[k] = copier(e as EntreeLexique);
  }
  for (const k of Object.keys(src)) {
    if (!(k in out) && aUnSg(src[k])) out[k] = copier(src[k] as EntreeLexique);
  }
  return out;
}

/**
 * Vocabulaire du lexique reçu du serveur (`user.domaine.lexique`), complété par le défaut.
 * Absent, ou équivalent au défaut → `vocabDefaut` lui-même (même objet : rien ne se re-rend).
 * Équivalent au défaut AVEC une clé en plus : un vocabulaire à part (la clé en plus y reste lisible, comme
 * côté serveur), dont `estDefaut` est vrai.
 */
export function vocabDuLexique(recu: unknown): Vocab {
  if (!recu || typeof recu !== 'object') return vocabDefaut;
  const complet = completerLexique(LEXIQUE_DEFAUT, recu);
  const sansCleEnPlus = Object.keys(complet).length === Object.keys(LEXIQUE_DEFAUT).length;
  return sansCleEnPlus && memesRendus(complet, LEXIQUE_DEFAUT) ? vocabDefaut : creerVocab(complet);
}
