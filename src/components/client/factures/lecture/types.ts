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
  /** Lignes du tableau de la facture (étape F3), à faire vérifier ; vide si aucune n'a été reconnue. */
  lignesFacture: LigneLue[];
  /** Pages lues, dans l'ordre des cadres (`cadre.page` = rang ici, à partir de 1) : taille dans les unités des cadres,
   * et place dans la facture déposée (rang du fichier à partir de 0, numéro de page dans ce fichier). */
  pages: PageVue[];
  avertissements: string[];
}

export interface PageVue { largeur: number; hauteur: number; fichier: number; page: number }

/** Ligne du tableau d'une facture (étape F3). Montants HT ; `remise` et `tauxTva` en %. */
export interface LigneLue {
  designation: string;
  /** Désignation de la première rangée seulement : sert à la clé d'apprentissage (une rangée suivante — n° de lot,
   * date limite — change d'une facture à l'autre). */
  designationPremiere: string;
  /** Référence produit du fournisseur (colonne « Réf. », « Code »). */
  reference: string | null;
  unite: string | null;
  quantite: number | null;
  prixUnitaire: number | null;
  remise: number | null;
  tauxTva: number | null;
  /** Montant HT net de la ligne, tel qu'imprimé (ou déduit, alors `aRelire`). */
  montant: number | null;
  /** quantité × prix − remise = montant (au millime ; à 10 millimes près sur une image) ; null s'il manque une valeur. */
  controle: boolean | null;
  aRelire: boolean;
  /** Montants lus dans des colonnes TTC (sans montant HT) : ramenés en HT avec le taux de la ligne quand il est connu,
   * sinon gardés ici (`montantTtc`, `prixTtc`) pour que la fenêtre les ramène avec le taux de la facture. */
  luEnTtc: boolean;
  montantTtc: number | null;
  prixTtc: number | null;
  /** Emplacement sur la page (unités de la page lue, y vers le bas). */
  cadre: { page: number; x0: number; y0: number; x1: number; y1: number };
}

/** Ce que l'appelant sait du client : son matricule et son nom ne sont jamais pris pour ceux du fournisseur. */
export interface Destinataire {
  matricule?: string | null;
  noms?: (string | null | undefined)[];
}

/** Suivi affiché pendant la lecture (« Lecture du texte… », « Reconnaissance des caractères… 40 % »). */
export type SuiviLecture = (etape: string, avancement?: number) => void;
