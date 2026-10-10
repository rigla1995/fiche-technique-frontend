// Lecture de l'EN-TÊTE d'une facture fournisseur, sans IA (factures fournisseur, étape F2 — labflow-reprise/achats-compta
// PLAN-FACTURES.md §4 « La lecture »). Tout se passe dans le navigateur de celui qui dépose la facture : rien n'est envoyé
// ailleurs, rien n'est conservé par la lecture. Deux sources : le texte d'un PDF (pdf.js, par positions) et la
// reconnaissance de caractères d'une image (tesseract.js, modèle « fra », servi par LabFlow sous /ocr/).
// Contrat commun des fonctions pures (rangees.ts, nombres.ts, entete.ts, rapprocher.ts) : syntaxe TypeScript effaçable
// et imports avec l'extension .ts, pour qu'elles se testent telles quelles par « node --test ».

/** Mot lu, avec son cadre en unités de la page (points d'un PDF, pixels d'une image), y croissant vers le bas. */
export interface Mot {
  t: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Confiance de la reconnaissance (0 à 100) ; absente pour le texte d'un PDF. */
  c?: number;
}

/** Rangée de la page : mots de gauche à droite. `debuts[i]` = position du mot i dans `texte`. */
export interface Rangee {
  mots: Mot[];
  texte: string;
  debuts: number[];
  y0: number;
  y1: number;
  /** Hauteur médiane des mots : taille du texte (le nom du fournisseur est souvent le plus gros de l'en-tête). */
  hauteur: number;
  page: number;
}

/** Page lue : ses rangées de haut en bas. */
export interface PageLue {
  largeur: number;
  hauteur: number;
  rangees: Rangee[];
}

export type SourceLue = 'pdf' | 'ocr';

/** Valeur lue. `aRelire` : lecture fragile (image, désaccord, contrôle faux) ; `note` s'affiche telle quelle. */
export interface ValeurLue<T> {
  valeur: T;
  aRelire: boolean;
  note?: string;
}

/** TVA d'un taux : base et montant quand la facture les imprime. */
export interface TvaLue {
  taux: number;
  base: number | null;
  montant: number | null;
}

export interface TotauxLus {
  ht: number | null;
  remise: number | null;
  fodec: number | null;
  tva: number | null;
  timbre: number | null;
  ttc: number | null;
  parTaux: TvaLue[];
  /** HT + FODEC + TVA + timbre = TTC (au millime près, à 10 millimes près pour une image) ; null si un montant manque. */
  coherents: boolean | null;
}

/** Ce que la lecture rend à l'écran. */
export interface EnteteLu {
  source: SourceLue;
  /** Matricule fiscal du FOURNISSEUR (celui du client, imprimé comme destinataire, est écarté). */
  matricule: ValeurLue<string> | null;
  nom: ValeurLue<string> | null;
  adresse: ValeurLue<string> | null;
  telephone: ValeurLue<string> | null;
  email: ValeurLue<string> | null;
  numero: ValeurLue<string> | null;
  /** Date de la facture, AAAA-MM-JJ. */
  date: ValeurLue<string> | null;
  totaux: TotauxLus;
  /** Texte lu, une rangée par entrée (affiché sur demande). */
  lignes: string[];
  avertissements: string[];
}

/** Ce que l'appelant sait du client : son matricule et son nom ne sont jamais pris pour ceux du fournisseur. */
export interface Destinataire {
  matricule?: string | null;
  noms?: (string | null | undefined)[];
}

/** Suivi affiché pendant la lecture (« Lecture du texte… », « Reconnaissance des caractères… 40 % »). */
export type SuiviLecture = (etape: string, avancement?: number) => void;
