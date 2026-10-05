// Couche « ocr » de la lecture de la patente (lot 3, étape 7) : matricule fiscal LU par une machine.
// Fonctions PURES (ni DOM ni tesseract). Sur la carte d'identification fiscale, le filet du tableau barre le haut des
// valeurs : une seule lecture ne suffit jamais. La rangée est donc relue plusieurs fois (échelles, cadrages et
// binarisations différents) et l'on VOTE ; sans accord suffisant, rien n'est proposé.
// Le vote seul ne protège pas la lettre-clé : le filet la coupe de la même façon à toutes les échelles, l'erreur est
// systématique. Or cette lettre se CALCULE à partir des 7 chiffres : pour l'identifiant et sa lettre, seules les
// lectures dont la lettre est celle du calcul ont une voix. La fin (/TVA/catégorie/établissement) n'a pas de clé : une
// lecture à lettre-clé cohérente ne la lit pas mieux qu'une autre, elle se vote donc sur TOUTES les lectures complètes.
import { MATRICULE_LU } from '../types.ts';

/** Lettre-clé : 23 lettres, sans I, O ni U. Le rang d'une lettre est un reste de division par 23. */
export const ALPHABET_CLE = 'ABCDEFGHJKLMNPQRSTVWXYZ';
/** Codes usuels : si la lecture en sort, la lettre est relue avec cet alphabet restreint (à confirmer auprès de la DGI). */
export const CODES_CATEGORIE = 'MPCNE';
export const CODES_TVA = 'APBDN';
export const CHIFFRES = '0123456789';

/** Seuils du vote : au moins 3 lectures à lettre-clé cohérente, et au moins 60 % d'accord sur CHAQUE segment. */
export const LECTURES_MIN = 3;
export const ACCORD_MIN = 0.6;

// Segments votés : identifiant et lettre-clé ENSEMBLE (la lettre se déduit des chiffres), TVA, catégorie, établissement.
const COMPLET = /^(\d{7}[A-Z])\/([A-Z])\/([A-Z])\/(\d{3})$/;
const SEGMENT_IDENTIFIANT = 1;
const SEGMENTS_FIN = [2, 3, 4];

/**
 * Lettre-clé attendue pour 7 chiffres : somme des chiffres pondérés par 7, 6, 5, 4, 3, 2, 1, puis reste de la division
 * par 23, pris comme rang dans l'alphabet de 23 lettres. Formule vérifiée sur les identifiants réels de l'essai.
 * Elle ne contrôle que des LECTURES par machine : jamais un motif pour refuser une saisie à la main.
 * Rend '' si l'entrée n'est pas faite de 7 chiffres.
 */
export const cleAttendue = (identifiant: string): string =>
  (/^\d{7}$/.test(identifiant) ? ALPHABET_CLE[[...identifiant].reduce((somme, c, i) => somme + Number(c) * (7 - i), 0) % 23] : '');

/** Vrai si la lecture (« 1234567R » ou « 1234567R/A/M/000 ») porte la lettre-clé que donnent ses 7 chiffres. */
export const cleCoherente = (lecture: string): boolean => {
  const attendue = cleAttendue(lecture.slice(0, 7));
  return attendue !== '' && lecture[7] === attendue;
};

// Corrections SÛRES, uniquement là où la position impose un chiffre. Rien n'est sûr pour la lettre-clé (un 7 lu à sa
// place peut être un T comme un J) : elle se relit avec un alphabet de lettres, elle ne se « corrige » jamais.
const EN_CHIFFRE: Record<string, string> = { O: '0', D: '0', Q: '0', I: '1', l: '1', '|': '1', '!': '1', Z: '2', S: '5', G: '6', T: '7', B: '8' };
const COMME_CHIFFRE = '0-9ODQIl|!ZSGTB';

/** Segment de chiffres (identifiant à 7 chiffres, numéro d'établissement) : lettres confondues remises en chiffres. */
export const corrigerChiffres = (s: string): string => [...s].map((c) => EN_CHIFFRE[c] ?? c).join('');

export interface PartiesMatricule {
  identifiant: string;
  cle: string;
  tva: string;
  categorie: string;
  etablissement: string;
}

/** Forme d'usage : identifiant + clé, puis /TVA/catégorie/établissement. */
export const composerMatricule = (p: PartiesMatricule): string => `${p.identifiant}${p.cle}/${p.tva}/${p.categorie}/${p.etablissement}`;

const A_PLAT = new RegExp(`(?:^| )([${COMME_CHIFFRE}]{3}) ([A-Z]) ([A-Z]) ([${COMME_CHIFFRE}]{7}) ?([A-Z])?(?= |$)`);

/**
 * Rangée du tableau lue « à plat », dans l'ordre imprimé (établissement, catégorie, TVA, matricule) :
 * « 000 M A 1234567R » → « 1234567R/A/M/000 ». Rend null si la rangée n'a pas cette forme. La clé peut manquer
 * (« 1234567/A/M/006 ») : c'est alors à l'appelant de refuser la lecture par la forme stricte (`matriculeLu`).
 */
export function remettreALEndroit(texte: string): string | null {
  const m = texte.replace(/[^0-9A-Za-z|! ]/g, ' ').replace(/\s+/g, ' ').trim().match(A_PLAT);
  if (!m) return null;
  return composerMatricule({ identifiant: corrigerChiffres(m[4]), cle: m[5] ?? '', tva: m[3], categorie: m[2], etablissement: corrigerChiffres(m[1]) });
}

/** Lecture acceptée seulement dans la forme stricte : une lecture sans lettre-clé est une erreur de lecture typique. */
export const matriculeLu = (valeur: string | null | undefined): string | null => (valeur && MATRICULE_LU.test(valeur) ? valeur : null);

export interface CandidatMatricule {
  valeur: string;
  voix: number;
  /** Faux : la lettre-clé lue n'est pas celle que donnent les 7 chiffres — cette lecture ne vote que pour la fin. */
  cleCoherente: boolean;
}

export interface VoteMatricule {
  /** Matricule complet, rempli SEULEMENT si l'identifiant ET la fin atteignent chacun leur seuil. */
  matricule: string | null;
  /**
   * Identifiant et lettre-clé seuls (8 caractères), dès qu'assez de lectures à lettre-clé cohérente s'accordent — même
   * quand la fin reste indécise (`matricule` est alors null).
   */
  identifiant: string | null;
  /** Lectures complètes distinctes (lettre-clé cohérente ou non), de la plus fréquente à la moins fréquente. */
  candidats: CandidatMatricule[];
  /** Nombre de lectures complètes (forme « 1234567R/A/M/000 »), sur `total` lectures tentées : elles votent la fin. */
  completes: number;
  /** Parmi elles, lectures à lettre-clé cohérente : les seules qui votent l'identifiant et sa lettre. */
  votantes: number;
  total: number;
  /**
   * Part de la valeur gagnante dans le segment le moins sûr (0 à 1) : identifiant et lettre-clé parmi les lectures à
   * lettre-clé cohérente, TVA, catégorie et établissement parmi toutes les lectures complètes.
   */
  accord: number;
}

// Valeur la plus lue d'un segment parmi des lectures complètes, et sa part de leurs voix.
function gagnant(lectures: CandidatMatricule[], segment: number): { valeur: string; part: number } {
  const decompte = new Map<string, number>();
  let voix = 0;
  for (const { valeur, voix: n } of lectures) {
    const v = (valeur.match(COMPLET) as RegExpMatchArray)[segment];
    decompte.set(v, (decompte.get(v) ?? 0) + n);
    voix += n;
  }
  const [valeur, n] = [...decompte].sort((a, b) => b[1] - a[1])[0];
  return { valeur, part: n / voix };
}

/**
 * Vote PAR SEGMENT sur les lectures complètes d'une même rangée.
 *   Identifiant et lettre-clé : seules votent les lectures dont la lettre est cohérente avec les 7 chiffres (au moins
 *   3 lectures, 60 % d'accord). Les autres restent citées parmi les candidats (si la formule avait une exception,
 *   l'admin les verrait), sans jamais remplir le champ.
 *   TVA, catégorie, établissement : TOUTES les lectures complètes votent (60 % d'accord sur chacun). Rien ne contrôle
 *   cette fin, et les quelques lectures à lettre-clé cohérente peuvent se tromper ensemble sur elle.
 * Fin indécise : pas de matricule complet, seulement l'identifiant — jamais une fin devinée.
 */
export function voterMatricule(lectures: (string | null | undefined)[]): VoteMatricule {
  const voix = new Map<string, number>();
  for (const l of lectures) if (l && COMPLET.test(l)) voix.set(l, (voix.get(l) ?? 0) + 1);
  const candidats = [...voix].map(([valeur, n]) => ({ valeur, voix: n, cleCoherente: cleCoherente(valeur) })).sort((a, b) => b.voix - a.voix);
  const completes = candidats.reduce((s, c) => s + c.voix, 0);
  const votants = candidats.filter((c) => c.cleCoherente);
  const votantes = votants.reduce((s, c) => s + c.voix, 0);
  const total = lectures.length;
  if (!votantes) return { matricule: null, identifiant: null, candidats, completes, votantes, total, accord: 0 };
  const racine = gagnant(votants, SEGMENT_IDENTIFIANT);
  const fin = SEGMENTS_FIN.map((segment) => gagnant(candidats, segment));
  const accord = Math.min(racine.part, ...fin.map((f) => f.part));
  const identifiant = votantes >= LECTURES_MIN && racine.part >= ACCORD_MIN ? racine.valeur : null;
  const finSure = fin.every((f) => f.part >= ACCORD_MIN);
  const matricule = identifiant && finSure ? [identifiant, ...fin.map((f) => f.valeur)].join('/') : null;
  return { matricule, identifiant, candidats, completes, votantes, total, accord };
}
