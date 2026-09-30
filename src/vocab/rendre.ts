// Balises de vocabulaire (lot 2, spec §2.2) : `[[méthode:clé(:arg)*]]`.
// `rendre(voc, texte)` remplace chaque balise par l'appel `voc.méthode('clé', …)`, en UNE
// seule passe (le texte rendu n'est jamais relu). Usages : gabarits du lexique, fr.json,
// messages du serveur, manuel.
//
// Grammaire stricte : \[\[([A-Za-z]+):([a-z0-9_]+)((?::[^\[\]|:\n]*)*)\]\]
// Arguments :
//   - `pl` ou un nombre entier → n ;
//   - `Nom`, `Titre` (et `nom`, `court`, `Court`) → casse du nom, pour les méthodes à déterminant ;
//   - `les`, `vos`, `ces`, `mes` → déterminant de `tous` / `Tous` ; `nu` → sans déterminant
//     (« [[Tous:prestataire:nu]] » = « Tous prestataires », comme `voc.Tous('prestataire', '')`) ;
//   - `acc` : [[acc:clé:masc:fem]] ou [[acc:clé:masc:fem:pl]] (masc et fem peuvent être vides) ;
//   - `n` : [[n:clé:3]] ;
//   - `det` / `Det` : [[det:clé:du]], [[det:clé:le:pl]], [[det:clé:le:court]] — le déterminant seul, suivi de
//     son séparateur (« du␣ », « de l' ») : « [[det:stock:du]]**[[nom:stock]]** ».
// Balise invalide (méthode inconnue, argument non reconnu, en double ou en trop, texte entre
// [[ ]] hors grammaire) → laissée telle quelle et signalée.
//
// SOURCE UNIQUE : recopié dans le backend (`src/utils/vocab.js`). Module PUR.

import type { VocabDe } from './vocab.ts';

/** Appelée pour chaque balise invalide ; par défaut `console.warn`. */
export type SignalBalise = (balise: string, raison: string) => void;

type VocabQuelconque = VocabDe<string>;
type Methode = (...args: unknown[]) => unknown;

// Tout ce qui ressemble à une balise (pour signaler aussi ce qui sort de la grammaire).
const CANDIDATE = /\[\[([^[\]\n]*)\]\]/g;
const STRICTE = /^([A-Za-z]+):([a-z0-9_]+)((?::[^[\]|:\n]*)*)$/;

// Méthodes appelables par balise, par forme d'arguments.
const SANS_ARGUMENT = new Set(['pl', 'Pl', 'nomS', 'NomS', 'icon']);
const AVEC_NOMBRE = new Set(['nom', 'Nom', 'Titre', 'MAJ', 'court', 'Court', 'compl', 'avecCourt']);
const AVEC_NOMBRE_ET_CASSE = new Set([
  'le', 'Le', 'un', 'Un', 'du', 'Du', 'de', 'De', 'au', 'Au', 'ce', 'Ce',
  'votre', 'Votre', 'mon', 'Mon', 'son', 'Son', 'nouveau', 'Nouveau',
]);
const AVEC_CASSE = new Set(['aucun', 'Aucun']);
const TOUS = new Set(['tous', 'Tous']);

const DET_SEUL = new Set(['det', 'Det']);

const CASSES = new Set(['nom', 'Nom', 'Titre', 'court', 'Court']);
const DETS_TOUS = new Set(['les', 'vos', 'ces', 'mes', 'nu']);
// Mot-clé de balise pour le déterminant vide de `tous` (un argument vide n'est pas admis par la grammaire).
const DET_NU = 'nu';
const NOMS_DETERMINANTS = new Set(['le', 'un', 'du', 'de', 'au', 'ce', 'aucun', 'votre', 'mon', 'son', 'nouveau']);
const ENTIER = /^\d+$/;

const nombre = (arg: string): number | boolean | undefined =>
  arg === 'pl' ? true : ENTIER.test(arg) ? Number(arg) : undefined;

// Rend une balise ; renvoie la raison du refus si elle est invalide.
const rendreBalise = (voc: VocabQuelconque, contenu: string): { texte: string } | { raison: string } => {
  const m = STRICTE.exec(contenu);
  if (!m) return { raison: 'hors grammaire' };
  const [, methode, cle, suite] = m;
  const args = suite ? suite.slice(1).split(':') : [];
  const appel = (...a: unknown[]): { texte: string } =>
    ({ texte: String((voc as unknown as Record<string, Methode>)[methode](cle, ...a)) });

  if (SANS_ARGUMENT.has(methode)) {
    return args.length ? { raison: `« ${methode} » ne prend pas d'argument` } : appel();
  }

  if (methode === 'acc') {
    if (args.length < 2 || args.length > 3) return { raison: '« acc » attend masc:fem ou masc:fem:pl' };
    if (args.length === 2) return appel(args[0], args[1]);
    const n = nombre(args[2]);
    return n === undefined ? { raison: `nombre non reconnu « ${args[2]} »` } : appel(args[0], args[1], n);
  }

  if (methode === 'n') {
    return args.length === 1 && ENTIER.test(args[0]) ? appel(Number(args[0])) : { raison: '« n » attend un nombre entier' };
  }

  if (DET_SEUL.has(methode)) {
    if (!args.length || !NOMS_DETERMINANTS.has(args[0])) {
      return { raison: `« ${methode} » attend un déterminant (${[...NOMS_DETERMINANTS].join(', ')})` };
    }
    let nDet: number | boolean | undefined;
    let cDet: string | undefined;
    for (const arg of args.slice(1)) {
      const valeur = nombre(arg);
      if (valeur !== undefined && nDet === undefined) nDet = valeur;
      else if (CASSES.has(arg) && cDet === undefined) cDet = arg;
      else return { raison: `argument non reconnu « ${arg} »` };
    }
    return appel(args[0], nDet, cDet);
  }

  const prendNombre = AVEC_NOMBRE.has(methode) || AVEC_NOMBRE_ET_CASSE.has(methode);
  const prendCasse = AVEC_NOMBRE_ET_CASSE.has(methode) || AVEC_CASSE.has(methode) || TOUS.has(methode);
  const prendDet = TOUS.has(methode);
  if (!prendNombre && !prendCasse) return { raison: `méthode inconnue « ${methode} »` };

  let n: number | boolean | undefined;
  let c: string | undefined;
  let d: string | undefined;
  for (const arg of args) {
    const valeur = nombre(arg);
    if (prendNombre && valeur !== undefined && n === undefined) n = valeur;
    else if (prendCasse && CASSES.has(arg) && c === undefined) c = arg;
    else if (prendDet && DETS_TOUS.has(arg) && d === undefined) d = arg === DET_NU ? '' : arg;
    else return { raison: `argument non reconnu « ${arg} »` };
  }
  if (TOUS.has(methode)) return appel(d, c);
  if (AVEC_CASSE.has(methode)) return appel(c);
  return appel(n, c);
};

const signalParDefaut: SignalBalise = (balise, raison) => {
  console.warn(`[vocab] balise invalide ${balise} : ${raison}`);
};

/**
 * Rend les balises `[[…]]` de `texte` avec le vocabulaire `voc`. Une seule passe.
 * Une balise invalide reste telle quelle et est signalée (`signaler`, par défaut console.warn).
 * Une valeur qui n'est pas une chaîne est renvoyée inchangée.
 */
export function rendre<K extends string>(voc: VocabDe<K>, texte: string, signaler: SignalBalise = signalParDefaut): string {
  if (typeof texte !== 'string' || texte.indexOf('[[') === -1) return texte;
  return texte.replace(CANDIDATE, (balise: string, contenu: string) => {
    const r = rendreBalise(voc as unknown as VocabQuelconque, contenu);
    if ('texte' in r) return r.texte;
    signaler(balise, r.raison);
    return balise;
  });
}

/** Rend toutes les chaînes d'un arbre (objets, tableaux) : le paquet de ressources `fr.json`. */
export function rendreTout<T, K extends string>(objet: T, voc: VocabDe<K>, signaler: SignalBalise = signalParDefaut): T {
  const parcours = (v: unknown): unknown => {
    if (typeof v === 'string') return rendre(voc, v, signaler);
    if (Array.isArray(v)) return v.map(parcours);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = parcours(x);
      return out;
    }
    return v;
  };
  return parcours(objet) as T;
}

/** Balises invalides d'un texte (validation avant enregistrement) : `[{ balise, raison }]`. */
export function balisesInvalides(texte: string): { balise: string; raison: string }[] {
  const invalides: { balise: string; raison: string }[] = [];
  if (typeof texte !== 'string') return invalides;
  const muet = new Proxy({}, { get: () => () => '' }) as unknown as VocabQuelconque;
  rendre(muet, texte, (balise, raison) => invalides.push({ balise, raison }));
  return invalides;
}
