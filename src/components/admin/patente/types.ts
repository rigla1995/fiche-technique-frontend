// Lecture de la patente SANS IA (lot 3, étape 7 — spec backend docs/lot-3-spec.md §5) : contrat commun des trois
// couches. Tout se passe dans le navigateur de l'admin : rien n'est envoyé au serveur ni à un tiers, rien n'est conservé.
//   couche « cachet » : code 2D « 2D-DOC » signé (extrait RNE, carte auto-entrepreneur) — code2d/
//   couche « pdf »    : texte d'un PDF officiel lu par POSITIONS (extrait RNE) — rne/
//   couche « ocr »    : reconnaissance de caractères (carte d'identification fiscale photographiée) — ocr/
// Modules chargés à la demande (import dynamique depuis ClientIdentiteForm). Imports internes avec l'extension .ts et
// syntaxe TypeScript effaçable seulement : les fonctions pures se testent telles quelles par « node --test ».
import type { IdentiteLegale } from '../../../utils/identiteLegale.ts';

export type ChampIdentite = keyof IdentiteLegale;
export type SourceLecture = 'cachet' | 'pdf' | 'ocr';
export type TypeDocument = 'extrait_rne' | 'carte_fiscale' | 'carte_auto_entrepreneur' | 'inconnu';

/** Valeur lue pour un champ de la fiche. `aRelire` : lecture fragile (OCR, désaccord entre deux passes). */
export interface ChampLu {
  valeur: string;
  source: SourceLecture;
  aRelire: boolean;
  note?: string;
}

/** Ce qu'une couche a lu : type de document, champs imprimables (Windows-1252), texte reconnu, mises en garde. */
export interface ResultatCouche {
  document: TypeDocument;
  champs: Partial<Record<ChampIdentite, ChampLu>>;
  /** Texte reconnu, une ligne par entrée, dans l'ordre de lecture (affiché à côté du formulaire). */
  lignes: string[];
  avertissements: string[];
}

/** Cachet électronique d'un code « 2D-DOC ». `non_verifiable` : certificat inconnu — jamais « document faux ». */
export interface Cachet {
  etat: 'valide' | 'invalide' | 'non_verifiable';
  /** Autorité et certificat de l'en-tête (ex. « TN01 » et « 0148 »). */
  autorite: string;
  certificat: string;
  /** Type de document de l'en-tête (« H1 » extrait RNE, « DP » carte auto-entrepreneur). */
  typeDocument: string;
  /** Date d'émission, au format jj/mm/aaaa, ou null. */
  emisLe: string | null;
  /** Identifiant unique porté par le code (7 chiffres + 1 lettre), ou null. */
  identifiant: string | null;
  /** Courte raison, en français, pour laquelle le cachet n'est pas « valide » (affichée telle quelle par l'écran). */
  motif?: string;
}

/** Couche « cachet » : le cachet et les champs que le code porte en lettres latines. */
export interface LectureCode2d extends ResultatCouche {
  cachet: Cachet;
}

/** Couche « pdf » : en plus, de quoi vérifier l'extrait sur le site officiel du RNE. */
export interface LectureTextePdf extends ResultatCouche {
  verification: { code: string | null; lien: string } | null;
}

/** Résultat remis à l'écran : les couches fusionnées (cachet, puis pdf, puis ocr). */
export interface LecturePatente extends ResultatCouche {
  cachet: Cachet | null;
  verification: { code: string | null; lien: string } | null;
  /** Couches qui ont donné quelque chose, dans l'ordre de priorité. */
  couches: SourceLecture[];
}

/** Suivi affiché pendant la lecture (« Lecture du texte… », « Reconnaissance des caractères… 40 % »). */
export type SuiviLecture = (etape: string, avancement?: number) => void;

// Caractères que les factures savent imprimer (Windows-1252) : même table que le serveur (src/utils/identite.js).
// Une valeur lue hors de cette table (arabe) n'est jamais proposée pour un champ.
const HORS_W1252 = /[^\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/u;
export const imprimable = (s: string): boolean => !HORS_W1252.test(s);

// Même nettoyage que le serveur AVANT de juger une valeur (src/utils/identite.js, fonction texte) : un texte latin
// copié d'un PDF n'est pas écarté pour une ligature, un tiret typographique ou un caractère invisible.
const LIGATURES: Record<string, string> = {
  '\u{FB00}': 'ff', '\u{FB01}': 'fi', '\u{FB02}': 'fl', '\u{FB03}': 'ffi', '\u{FB04}': 'ffl', '\u{FB05}': 'st', '\u{FB06}': 'st',
};

/** Texte d'un champ : nettoyé comme au serveur, espaces réduits, rogné ; '' si la valeur n'est pas imprimable. */
export const texteChamp = (s: string | null | undefined): string => {
  const t = String(s ?? '')
    .normalize('NFC')
    .replace(/[\u{FB00}-\u{FB06}]/gu, (c) => LIGATURES[c])
    .replace(/[\u{AD}\u{200B}-\u{200D}\u{2060}\u{FEFF}]/gu, '')
    .replace(/[\u{2010}-\u{2012}\u{2212}]/gu, '-')
    .replace(/[\u{7F}-\u{9F}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return t && imprimable(t) ? t : '';
};

// Matricule fiscal LU par une machine : forme stricte (la clé est exigée quand le suffixe est présent). La saisie à la
// main reste tolérante (src/components/admin/matriculeFiscal.ts : clé absente = avertissement) ; une lecture, non :
// « 1234567/A/M/006 » (clé perdue, zéro lu 6) est une erreur de lecture typique qui passerait la forme tolérante.
export const MATRICULE_LU = /^\d{7}[A-Z](\/[A-Z]\/[A-Z]\/\d{3})?$/;
