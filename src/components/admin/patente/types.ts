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

/** Texte d'un champ : espaces réduits, rognés ; '' si la valeur n'est pas imprimable. */
export const texteChamp = (s: string | null | undefined): string => {
  const t = String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  return t && imprimable(t) ? t : '';
};

// Matricule fiscal LU par une machine : forme stricte (la clé est exigée quand le suffixe est présent). La saisie à la
// main reste tolérante (src/components/admin/matriculeFiscal.ts : clé absente = avertissement) ; une lecture, non :
// « 1961453/A/M/006 » est une erreur d'OCR typique qui passerait la forme tolérante.
export const MATRICULE_LU = /^\d{7}[A-Z](\/[A-Z]\/[A-Z]\/\d{3})?$/;
