// Lexique par DÉFAUT d'un domaine d'activité — v2 (lot 2) = les termes ACTUELS de l'app
// (restauration). SOURCE UNIQUE : ce fichier. Le backend en reçoit une copie générée
// (`node scripts/sync-vocab-back.mjs` → backend `src/config/lexiqueDefaut.js`).
// Le JSONB `domaines_activite.lexique` ne porte que les écarts ; `resoudreLexique`
// (./vocab.ts) les fusionne avec ce défaut.
//
// Entrée : { sg, pl, g: 'm' | 'f', el, icon?, court?: { sg, pl, el? }, appo? }
//   sg / pl : formes stockées avec leur casse d'affichage (« Activité », « Food cost ») ;
//   g       : genre ; el : élision (« l'activité » contre « le labo »), valable au pluriel
//             pour « de » (« d'activités ») ;
//   court   : forme courte ou sigle (« PT », « Appro », « FT ») ; absente → sg / pl ;
//   appo    : le terme s'emploie en apposition dans une phrase (« stock labo »).
// Clés dérivées : leur DÉCLARATION (derive_de, mode, gabarit) n'existe qu'ICI et n'est jamais
// surchargeable par un domaine ; leur ENTRÉE (sg, pl, g, el…) l'est, comme celle d'une clé simple
// (spec §1.3 règle 1 : « D surcharge K → entrée de K »).
//   derive_de : clé parente ; mode : 'copie' | 'pluriel_titre' | 'gabarit' ;
//   gabarit   : texte à balises (mode 'gabarit'), rendu avec le lexique du domaine.
// Une clé = UN terme (le pluriel est porté par `pl`, jamais par une clé à part).
// Module PUR : aucun import, syntaxe TypeScript effaçable uniquement.

export type Genre = 'm' | 'f';
export type ModeDerive = 'copie' | 'pluriel_titre' | 'gabarit';

export interface FormeCourte {
  sg: string;
  pl?: string;
  el?: boolean;
}

export interface EntreeLexique {
  sg: string;
  pl?: string;
  g?: Genre;
  el?: boolean;
  icon?: string;
  court?: FormeCourte;
  appo?: boolean;
  derive_de?: string;
  mode?: ModeDerive;
  gabarit?: string;
}

export type Lexique = Readonly<Record<string, EntreeLexique>>;

// Gel en profondeur (entrées et formes courtes) : le défaut est partagé par tous les comptes.
const geler = <T extends Record<string, EntreeLexique>>(lexique: T): Readonly<T> => {
  for (const entree of Object.values(lexique)) {
    if (entree.court) Object.freeze(entree.court);
    Object.freeze(entree);
  }
  return Object.freeze(lexique);
};

export const LEXIQUE_DEFAUT = geler({
  // ── Les 32 clés d'origine (formes inchangées au caractère près) ──────────────
  activite:           { sg: 'Activité',            pl: 'Activités',             g: 'f', el: true,  icon: '🏪', appo: true },
  labo:               { sg: 'Labo',                pl: 'Labos',                 g: 'm', el: false, icon: '🏭', appo: true },
  produit_vendable:   { sg: 'Produit vendable',    pl: 'Produits vendables',    g: 'm', el: false, icon: '🛒' },
  produit_utilisable: { sg: 'Produit utilisable',  pl: 'Produits utilisables',  g: 'm', el: false, icon: '🧂', court: { sg: 'PU', pl: 'PU' } },
  produit_valorise:   { sg: 'Produit valorisé',    pl: 'Produits valorisés',    g: 'm', el: false, icon: '💎' },
  article:            { sg: 'Article',             pl: 'Articles',              g: 'm', el: true,  icon: '📦' },
  ingredient:         { sg: 'Ingrédient',          pl: 'Ingrédients',           g: 'm', el: true,  icon: '🥕' },
  recette:            { sg: 'Recette',             pl: 'Recettes',              g: 'f', el: false, icon: '📖' },
  fiche_technique:    { sg: 'Fiche technique',     pl: 'Fiches techniques',     g: 'f', el: false, icon: '📋', court: { sg: 'FT', pl: 'FT' } },
  portion:            { sg: 'Portion',             pl: 'Portions',              g: 'f', el: false, icon: '🍽️' },
  food_cost:          { sg: 'Food cost',           pl: 'Food costs',            g: 'm', el: false, icon: '📊' },
  cout_matiere:       { sg: 'Coût matière',        pl: 'Coûts matière',         g: 'm', el: false, icon: '💰' },
  marge:              { sg: 'Marge',               pl: 'Marges',                g: 'f', el: false, icon: '📈' },
  transfert:          { sg: 'Transfert',           pl: 'Transferts',            g: 'm', el: false, icon: '🚚' },
  appro:              { sg: 'Approvisionnement',   pl: 'Approvisionnements',    g: 'm', el: true,  icon: '📥', court: { sg: 'Appro', pl: 'Appros' } },
  perte:              { sg: 'Perte',               pl: 'Pertes',                g: 'f', el: false, icon: '🗑️' },
  inventaire:         { sg: 'Inventaire',          pl: 'Inventaires',           g: 'm', el: true,  icon: '📝' },
  vente:              { sg: 'Vente',               pl: 'Ventes',                g: 'f', el: false, icon: '💵' },
  acheteur:           { sg: 'Acheteur',            pl: 'Acheteurs',             g: 'm', el: true,  icon: '🤝', appo: true },
  gerant:             { sg: 'Gérant',              pl: 'Gérants',               g: 'm', el: false, icon: '👤', appo: true },
  fournisseur:        { sg: 'Fournisseur',         pl: 'Fournisseurs',          g: 'm', el: false, icon: '🏬' },
  depot:              { sg: 'Dépôt',               pl: 'Dépôts',                g: 'm', el: false, icon: '🏗️' },
  pt:                 { sg: 'Produit transformé',  pl: 'Produits transformés',  g: 'm', el: false, icon: '🍲', court: { sg: 'PT', pl: 'PT' } },
  stock:              { sg: 'Stock',               pl: 'Stocks',                g: 'm', el: false, icon: '📦' },
  prestataire:        { sg: 'Prestataire',         pl: 'Prestataires',          g: 'm', el: false, icon: '🛵' },
  supplement:         { sg: 'Supplément',          pl: 'Suppléments',           g: 'm', el: false, icon: '➕' },
  // Clés espace_* : dérivées par gabarit (leur rendu par défaut = la forme stockée ci-dessous).
  espace_activites:   { sg: 'Espace Activités',    pl: 'Espaces Activités',     g: 'm', el: true,  icon: '🏪', derive_de: 'activite', mode: 'gabarit', gabarit: 'Espace [[Pl:activite]]' },
  espace_labo:        { sg: 'Espace Labo',         pl: 'Espaces Labo',          g: 'm', el: true,  icon: '🏭', derive_de: 'labo',     mode: 'gabarit', gabarit: 'Espace [[Court:labo]]' },
  espace_vente:       { sg: 'Espace Vente',        pl: 'Espaces Vente',         g: 'm', el: true,  icon: '💵', derive_de: 'vente',    mode: 'gabarit', gabarit: 'Espace [[Nom:vente]]' },
  espace_acheteurs:   { sg: 'Espace Acheteurs',    pl: 'Espaces Acheteurs',     g: 'm', el: true,  icon: '🤝', derive_de: 'acheteur', mode: 'gabarit', gabarit: 'Espace [[Pl:acheteur]]' },
  espace_produits:    { sg: 'Espace Produit',      pl: 'Espaces Produit',       g: 'm', el: true,  icon: '💎', derive_de: 'produit',  mode: 'gabarit', gabarit: 'Espace [[Nom:produit]]' },
  referentiel:        { sg: 'Référentiel',         pl: 'Référentiels',          g: 'm', el: false, icon: '📚' },

  // ── Clés simples ajoutées au lot 2 ───────────────────────────────────────────
  produit:            { sg: 'Produit',             pl: 'Produits',              g: 'm', el: false },
  produit_compose:    { sg: 'Produit composé',     pl: 'Produits composés',     g: 'm', el: false },

  // ── Clés dérivées ajoutées au lot 2 ──────────────────────────────────────────
  labo_long:          { sg: 'Laboratoire',               pl: 'Laboratoires',               g: 'm', el: false, icon: '🏭', derive_de: 'labo',     mode: 'copie' },
  labo_desc:          { sg: 'Laboratoire de production', pl: 'Laboratoires de production', g: 'm', el: false, icon: '🏭', derive_de: 'labo',     mode: 'copie' },
  activite_desc:      { sg: 'Point de vente',            pl: 'Points de vente',            g: 'm', el: false, icon: '🏪', derive_de: 'activite', mode: 'copie' },
  cat_pt_utilisable:  { sg: 'Produits Transformés Utilisables', pl: 'Produits Transformés Utilisables', g: 'm', el: false, icon: '🧂', derive_de: 'produit_utilisable', mode: 'pluriel_titre' },
  cat_pt_valorise:    { sg: 'Produits Composés Valorisés',      pl: 'Produits Composés Valorisés',      g: 'm', el: false, icon: '💎', derive_de: 'produit_valorise',   mode: 'pluriel_titre' },
  cat_pt_vendable:    { sg: 'Produits Transformés Vendables',   pl: 'Produits Transformés Vendables',   g: 'm', el: false, icon: '🛒', derive_de: 'produit_vendable',   mode: 'pluriel_titre' },
});

/** Clé du lexique par défaut (les appels `voc.…('clé')` sont vérifiés à la compilation). */
export type CleLexique = keyof typeof LEXIQUE_DEFAUT;

export const LEXIQUE_CLES: readonly CleLexique[] = Object.freeze(Object.keys(LEXIQUE_DEFAUT) as CleLexique[]);
