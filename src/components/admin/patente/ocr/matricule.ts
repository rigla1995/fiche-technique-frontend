// Couche « ocr » de la lecture de la patente (lot 3, étape 7) : matricule fiscal LU par une machine.
// Fonctions PURES (ni DOM ni tesseract). Sur la carte d'identification fiscale, le filet du tableau barre le haut des
// valeurs : une seule lecture ne suffit jamais. La rangée est donc relue plusieurs fois (échelles, cadrages et
// binarisations différents) et l'on VOTE segment par segment ; sans accord suffisant, rien n'est proposé.
import { MATRICULE_LU } from '../types.ts';

/** Lettre-clé : lettres seules, sans I, O ni U (alphabet à confirmer auprès de la DGI). */
export const ALPHABET_CLE = 'ABCDEFGHJKLMNPQRSTVWXYZ';
/** Codes usuels : si la lecture en sort, la lettre est relue avec cet alphabet restreint (à confirmer auprès de la DGI). */
export const CODES_CATEGORIE = 'MPCNE';
export const CODES_TVA = 'APBDN';
export const CHIFFRES = '0123456789';

/** Seuils du vote : au moins 3 lectures complètes, et au moins 60 % d'accord sur CHAQUE segment. */
export const LECTURES_MIN = 3;
export const ACCORD_MIN = 0.6;

const COMPLET = /^(\d{7})([A-Z])\/([A-Z])\/([A-Z])\/(\d{3})$/;

// Corrections SÛRES, uniquement là où la position impose un chiffre. Rien n'est sûr pour la lettre-clé (un 7 lu à sa
// place peut être un T comme un J) : elle se relit avec un alphabet de lettres et se vote, elle ne se « corrige » jamais.
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
 * « 000 M A 1234567A » → « 1234567A/A/M/000 ». Rend null si la rangée n'a pas cette forme. La clé peut manquer
 * (« 1234567/A/M/006 ») : c'est alors à l'appelant de refuser la lecture par la forme stricte (`matriculeLu`).
 */
export function remettreALEndroit(texte: string): string | null {
  const m = texte.replace(/[^0-9A-Za-z|! ]/g, ' ').replace(/\s+/g, ' ').trim().match(A_PLAT);
  if (!m) return null;
  return composerMatricule({ identifiant: corrigerChiffres(m[4]), cle: m[5] ?? '', tva: m[3], categorie: m[2], etablissement: corrigerChiffres(m[1]) });
}

/** Lecture acceptée seulement dans la forme stricte : une lecture sans lettre-clé est une erreur d'OCR typique. */
export const matriculeLu = (valeur: string | null | undefined): string | null => (valeur && MATRICULE_LU.test(valeur) ? valeur : null);

export interface VoteMatricule {
  /** Matricule complet, rempli SEULEMENT si l'accord est suffisant. */
  matricule: string | null;
  /** Lectures complètes distinctes, de la plus fréquente à la moins fréquente. */
  candidats: { valeur: string; voix: number }[];
  /** Nombre de lectures complètes (forme « 1234567A/A/M/000 »), sur `total` lectures tentées. */
  completes: number;
  total: number;
  /** Part de la valeur gagnante dans le segment le moins sûr (0 à 1). */
  accord: number;
  /** Vrai si la lettre-clé n'est pas la même dans toutes les lectures complètes. */
  cleDisputee: boolean;
}

/** Vote PAR SEGMENT (identifiant, clé, TVA, catégorie, établissement) sur les lectures complètes d'une même rangée. */
export function voterMatricule(lectures: (string | null | undefined)[]): VoteMatricule {
  const voix = new Map<string, number>();
  for (const l of lectures) if (l && COMPLET.test(l)) voix.set(l, (voix.get(l) ?? 0) + 1);
  const candidats = [...voix].map(([valeur, n]) => ({ valeur, voix: n })).sort((a, b) => b.voix - a.voix);
  const completes = candidats.reduce((s, c) => s + c.voix, 0);
  if (!completes) return { matricule: null, candidats, completes, total: lectures.length, accord: 0, cleDisputee: false };
  const segments: Map<string, number>[] = [new Map(), new Map(), new Map(), new Map(), new Map()];
  for (const [valeur, n] of voix) {
    (valeur.match(COMPLET) as RegExpMatchArray).slice(1).forEach((v, i) => segments[i].set(v, (segments[i].get(v) ?? 0) + n));
  }
  const gagnants = segments.map((s) => [...s].sort((a, b) => b[1] - a[1])[0]);
  const accord = Math.min(...gagnants.map(([, n]) => n)) / completes;
  const [identifiant, cle, tva, categorie, etablissement] = gagnants.map(([v]) => v);
  const suffisant = completes >= LECTURES_MIN && accord >= ACCORD_MIN;
  return {
    matricule: suffisant ? composerMatricule({ identifiant, cle, tva, categorie, etablissement }) : null,
    candidats, completes, total: lectures.length, accord, cleDisputee: segments[1].size > 1,
  };
}
