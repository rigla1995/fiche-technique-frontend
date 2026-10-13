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
  /** Étape F5 (page d'image) : passage de la page lue au cadre de la page droite, où s'exprime une mise en page ;
   * `apprendre` : la mise en page vue ici peut s'apprendre (feuille recadrée). Absent : page d'un PDF (cadre = page). */
  cadre?: { versFraction: (x: number, y: number) => { x: number; y: number }; depuisFraction: (fx: number, fy: number) => { x: number; y: number }; apprendre: boolean };
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
  /** Étape F5 : mise en page du tableau vue par cette lecture (titre des colonnes lu), à apprendre à la validation. */
  miseEnPage?: MiseEnPage | null;
  /** Étape F5 : la mise en page apprise du fournisseur a servi à lire les lignes. */
  miseEnPageConnue?: boolean;
}

/** Genre d'une colonne du tableau d'une facture (lecture/lignes.ts). */
export type GenreColonne = 'num' | 'ref' | 'des' | 'unite' | 'qte' | 'pu' | 'puttc' | 'remise' | 'tva' | 'montant' | 'ttc';

/**
 * Étape F5 : mise en page du tableau d'un fournisseur — ses colonnes (genre, début et fin du TITRE) en fractions de la
 * largeur de la page. Apprise à la validation d'une facture lue (partagée entre les comptes, par matricule fiscal :
 * réponse 12 du client), elle sert à lire une photo dont le titre des colonnes est mal reconnu.
 */
export interface MiseEnPage { colonnes: { genre: GenreColonne; x0: number; x1: number }[] }

export interface PageVue {
  largeur: number; hauteur: number; fichier: number; page: number;
  /** Étape F5 : page lue sur une IMAGE — le chemin de l'image d'origine à la page lue (feuille recadrée, quarts de tour,
   * redressement), pour replacer une ligne sur l'image affichée. Absent pour le texte d'un PDF. */
  trajet?: Trajet;
}

/**
 * Étape F5 (lecture/image.ts) : de l'image d'origine (`largeur` × `hauteur`, en pixels de l'image donnée à la lecture) à
 * la page lue. Deux chemins : `rotation: 'source'` — l'image d'origine tournée de `angle`, puis réduite à `echelle` ;
 * `'pixels'` — réduite à `echelle`, feuille `coins` ramenée à son rectangle, `quarts` quarts de tour, puis tournée de
 * `angle`. Les tailles intermédiaires sont gardées (pas de calcul d'arrondi à refaire).
 */
export interface Trajet {
  largeur: number;
  hauteur: number;
  rotation: 'source' | 'pixels';
  echelle: number;
  /** Coins de la feuille dans l'image réduite (haut gauche, haut droit, bas droit, bas gauche), ou null. */
  coins: [number, number][] | null;
  /** La feuille a-t-elle été trouvée seule (sinon, coins choisis : « Recadrer ») ? */
  coinsAuto: boolean;
  quarts: number;
  angle: number;
  /** Tailles : image réduite, feuille redressée, après les quarts de tour, page lue. */
  tailles: { reduite: [number, number]; feuille: [number, number]; quarts: [number, number]; lue: [number, number] };
}

/** Étape F5 : ce que l'on choisit pour une page d'image (« Recadrer », « Pivoter ») avant de la relire. */
export interface PreparationPage {
  /** Coins de la feuille en FRACTIONS de l'image d'origine (0 à 1) ; null : pas de recadrage ; absent : recherche seule. */
  coins?: [number, number][] | null;
  /** Quarts de tour dans le sens des aiguilles d'une montre ; absent : orientation cherchée seule si la page est illisible. */
  quarts?: number;
}

/** Ligne du tableau d'une facture (étape F3). Montants HT ; `remise` et `tauxTva` en %. */
export interface LigneLue {
  designation: string;
  /** Désignation sans ses rangées de lot ou de date (n° de lot, DLC : changent d'une facture à l'autre) : sert à la clé
   * d'apprentissage. Le conditionnement d'une rangée suivante (« 6 x 0,5 L ») en fait partie. */
  designationCle: string;
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
