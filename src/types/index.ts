export interface User {
  id: number;
  name: string;
  email: string;
  role: 'super_admin' | 'boss' | 'client' | 'gerant' | 'acheteur';
  onboardingStep?: number;
  phone?: string;
  entrepriseName?: string | null;
  modeCompte?: 'actif' | 'read_only' | 'desactive' | 'archive' | 'bloque';
  prolongationJours?: number;
  gerantParentId?: number;
  gerantActiviteId?: number;
  gerantActiviteType?: 'labo' | 'activite';
  gerantActiviteNom?: string | null;
  gerantActiviteIds?: number[];
  gerantLaboIds?: number[];
  gerantAccesAcheteurs?: boolean;
  activitesCount?: number;
  labosCount?: number;
  /**
   * Profil de domaine du compte (client : son abonnement ; gérant : parent ; admin/boss : null).
   * Acheteur (lot 2, spec §2.4) : domaine du client VENDEUR réduit à { id, slug, nom, lexique } — ni
   * `composants` ni `regles` (toute lecture de ces deux champs passe par `?.`).
   * Lexique allégé (lot 2b §5.7) : `null` pour le vocabulaire par défaut.
   */
  domaine?: DomaineDuCompte | null;
}

export interface Promotion {
  id: number;
  abonnementId: number;
  type: 'percent_off' | 'free_months' | 'fixed_price';
  appliesTo: 'onboarding' | 'mensualite' | 'les_deux' | 'supplement_gerant' | 'supplement_labo' | 'supplement_activite';
  discountOnboarding: number | null;
  discountMensualite: number | null;
  fixedOnboarding: number | null;
  fixedMensualite: number | null;
  discountSupplement: number | null;
  fixedSupplement: number | null;
  dateDebut: string;
  monthsDuration: number | null;
  dateFin: string | null;
  notes: string | null;
  createdAt: string;
  isActive: boolean;
  isSystem?: boolean; // promo « 1er mois offert » verrouillée : non supprimable/éditable
  statutPromo: 'actif' | 'expiré';
}

/** Détail d'un composant souscrit (abonnement_config_composants joint à domaine_composants). */
export interface ComposantConfig {
  composantId?: number;
  code: string;
  libelle: string;
  libellePluriel?: string | null;
  icone?: string | null;
  typeTechnique: 'activite' | 'labo' | 'gerant' | 'acheteurs';
  nb: number;
}

export interface AbonnementConfig {
  id: number;
  abonnementId: number;
  nbActivites: number;
  nbLabos: number;
  nbGerants: number;
  nbAcheteurs?: number;
  formuleActivites?: 'basique' | 'premium' | null;
  montantOnboarding: number;
  /** Domaine d'activité du compte (lot 1a) — les compteurs ci-dessus sont dérivés des composants. */
  domaineId?: number | null;
  domaineSlug?: string | null;
  domaineNom?: string | null;
  composants?: ComposantConfig[];
  createdAt: string;
  updatedAt: string;
}

export interface SupportDemande {
  id: number;
  clientId: number;
  clientNom: string | null;
  clientEmail: string | null;
  type: 'supplement' | 'aide';
  statut: 'en_attente' | 'validée' | 'refusée';
  nbActivitesSupp?: number | null;
  nbLabosSupp?: number | null;
  nbGerantsSupp?: number | null;
  /** Option Acheteurs : QUOTA TOTAL cible (borne de palier 10/20/50/100), pas un incrément. */
  nbAcheteursCible?: number | null;
  description?: string | null;
  notesAdmin?: string | null;
  traitePar?: number | null;
  traiteParNom?: string | null;
  traiteLe?: string | null;
  createdAt: string;
  createdBy?: number | null;
  createdByNom?: string | null;
}

export interface Abonnement {
  id: number;
  clientId: number;
  clientNom: string;
  clientEmail: string;
  statutOnboarding: 'payé' | 'impayé' | 'offert' | 'gratuit' | 'en_attente';
  montantOnboarding: number;
  dateOnboarding: string | null;
  dateDebut: string;
  modeCompte: 'actif' | 'read_only' | 'desactive' | 'archive' | 'bloque';
  prolongationJours: number;
  notes: string | null;
  hasActivePromo?: boolean;
  inviteSent?: boolean;
  moduleVenteActif?: boolean;
  moduleVenteActivatedAt?: string | null;
  moduleAcheteursActif?: boolean;
  moduleAcheteursActivatedAt?: string | null;
  config?: AbonnementConfig | null;
  paiements?: Paiement[];
  promotions?: Promotion[];
  pricing?: {
    baseMensuel: number | null;
    baseOnboarding: number | null;
    effectifMensuel: number | null;
    effectifOnboarding: number | null;
    activePromoMensuel: Promotion | null;
    activePromoOnboarding: Promotion | null;
    configBreakdown?: {
      formuleActivites?: 'basique' | 'premium' | null;
      activite: { nb: number; total: number };
      labo:     { nb: number; total: number };
      gerant:   { nb: number; total: number };
      acheteurs?: { nb: number; palier: 10 | 20 | 50 | 100 | null; total: number };
      prixActiviteSup: number;
      prixLaboSup: number;
      prixGerantSup: number;
    };
  };
  createdAt: string;
  updatedAt: string;
}

export interface Paiement {
  id: number;
  abonnementId: number;
  mois: string;
  montantDt: number | null;
  statut: 'payé' | 'impayé' | 'en_attente' | 'remisé' | 'gratuit';
  saisiePar: number | null;
  dateSaisie: string | null;
  datePaiement: string | null;
  notes: string | null;
}

export interface TarifsConfig {
  [cle: string]: {
    id: number;
    /** Valeur résolue (surcharge du domaine si présente, sinon valeur générale). */
    valeur: number;
    description: string;
    /** Valeur de la grille générale (tarifs_config). */
    valeurGenerale?: number;
    /** Surcharge du domaine demandé (`?domaineId=`) ; null = héritée de la grille générale. */
    surcharge?: number | null;
  };
}

export interface Demande {
  id: number;
  demandeurId: number;
  demandeurNom: string;
  demandeurType: string;
  typeDemande: 'gerant_sup' | 'labo_sup' | 'activer_module_vente';
  statut: 'en_attente' | 'validée' | 'refusée';
  montantMensuelDt: number | null;
  montantOnboardingClient?: number | null;
  notesClient: string | null;
  notesAdmin: string | null;
  traiteParNom: string | null;
  traite_le: string | null;
  createdAt: string;
}

export interface Gerant {
  id: number;
  nom: string;
  email: string;
  telephone: string;
  parentId: number;
  activiteId: number | null;
  activiteType: 'labo' | 'activite' | null;
  activiteIds?: number[];
  laboIds?: number[];
  accesAcheteurs?: boolean;
  estGratuit: boolean;
  montantMensuel: number;
  actif: boolean;
  createdAt: string;
  activatedAt?: string | null;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Unit {
  id: number;
  name: string;
  hasAppros?: boolean;
  /** Nb d'articles utilisant cette unité — > 0 = suppression verrouillée */
  nbArticles?: number;
}

export interface Category {
  id: number;
  name: string;
  familleId?: number | null;
  familleName?: string | null;
  clientId?: number | null;
  hasAppros?: boolean;
  /** Nb d'articles dans cette catégorie — > 0 = suppression verrouillée */
  nbArticles?: number;
}

export interface Famille {
  id: number;
  name: string;
  consommable: boolean;
  vendable: boolean;
  hasAppros?: boolean;
  /** Nb de catégories/articles liés — > 0 = suppression verrouillée */
  nbCategories?: number;
  nbArticles?: number;
  clientId: number;
}

export interface Article {
  id: number;
  name: string;
  unit: Unit;
  unitId: number;
  unitName?: string;
  categorieId?: number | null;
  categorieName?: string | null;
  familleId?: number | null;
  familleName?: string | null;
  clientId?: number | null;
  hasAppros?: boolean;
  /** Module Acheteurs : article proposable aux acheteurs (opt-in) */
  commandable?: boolean;
}

// Legacy alias for backward compatibility during migration
export type Ingredient = Article;

export interface ProductIngredient {
  id?: number;
  ingredient: Ingredient;
  ingredientId: number;
  portion: number;
  cost?: number;
}

export interface ProductComponent {
  id?: number;
  subProduct: Product;
  subProductId: number;
  portion: number;
  cost?: number;
}

export interface Product {
  id: number;
  name: string;
  type: 'utilisable' | 'vendable';
  origine?: 'labo' | 'activite';
  ingredients: ProductIngredient[];
  subProducts: ProductComponent[];
  totalCost: number;
  ingredientsCount?: number;
  subProductsCount?: number;
  parentProductsCount?: number;
  userId: number;
  activiteId?: number | null;
  activites?: { id: number; nom: string }[];
  labos?: { id: number; nom: string }[];
  createdAt?: string;
  isStockIngredient?: boolean;
  isSupplement?: boolean;
  refProduit?: string | null;
  categorieProduitId?: number | null;
  categorieProduitName?: string | null;
}

export type TypeProduitCategorie = 'vendable' | 'supplement' | 'valorise';

export interface CategorieProduit {
  id: number;
  name: string;
  typeProduit?: TypeProduitCategorie;
  clientId?: number | null;
  produitsCount?: number;
}

export interface Client {
  id: number;
  name: string;
  email: string;
  phone?: string;
  onboardingStep?: number;
  createdAt?: string;
  activatedAt?: string | null;
  /** Compat : toujours renvoyé par l'API (= [domaineId]). */
  domaineIds?: number[];
  domaineId?: number | null;
  domaineNom?: string | null;
}

// ── Profil de domaine (lot 1a) ───────────────────────────────────────────────
export type ComposantTypeTechnique = 'activite' | 'labo' | 'gerant' | 'acheteurs';

/** Composant du menu de configuration d'un domaine (domaine_composants). */
export interface Composant {
  id?: number;
  code: string;
  libelle: string;
  libellePluriel?: string | null;
  icone?: string | null;
  aide?: string | null;
  typeTechnique: ComposantTypeTechnique;
  venteActive: boolean;
  productionActive: boolean;
  nbMin: number;
  nbMax: number | null;
  ordre: number;
  actif: boolean;
  /** Genre grammatical du libellé (migration 192, lot 2b §5.4) : 'm' par défaut. */
  genre?: 'm' | 'f' | null;
  /** Élision forcée (vrai / faux) ; null ou absent = déduite du libellé (lot 2b §4.2). */
  elision?: boolean | null;
}

/** Forme courte ou sigle d'un terme (« PT », « Appro ») ; `el` absent → élision de l'entrée. */
export interface LexiqueFormeCourte {
  sg: string;
  pl: string;
  el?: boolean;
}

/**
 * Entrée de lexique (v2, lot 2) : singulier, pluriel, genre, élision, icône, forme courte,
 * apposition. `derive_de` / `mode` / `gabarit` décrivent une clé dérivée : ils viennent du
 * lexique par défaut (src/vocab/lexiqueDefaut.ts) et ne sont pas surchargeables par un domaine.
 */
export interface LexiqueEntree {
  sg: string;
  pl: string;
  g: 'm' | 'f';
  el: boolean;
  icon?: string;
  court?: LexiqueFormeCourte;
  appo?: boolean;
  derive_de?: string;
  mode?: 'copie' | 'pluriel_titre' | 'gabarit';
  gabarit?: string;
}

/** Profil résolu d'un domaine d'activité (composants + lexique + règles). */
export interface DomaineProfil {
  id: number;
  slug: string;
  nom: string;
  description?: string | null;
  nbClients?: number;
  composants: Composant[];
  lexique: Record<string, LexiqueEntree>;
  regles: Record<string, unknown>;
}

/**
 * Domaine tel qu'un COMPTE le reçoit (lot 2b, spec §5.7) : `/auth/login`, `/auth/me` (`User.domaine`),
 * `GET /api/domaines` (client, gérant, acheteur) et `GET /api/entreprise`. `lexique` vaut `null` quand le
 * vocabulaire du compte est le vocabulaire par défaut (`vocabDuLexique(null) === vocabDefaut`) ; sinon c'est
 * le lexique résolu sans `derive_de`, `mode` ni `gabarit`. Les écrans admin gardent `DomaineProfil`
 * (profil complet).
 */
export type DomaineDuCompte = Omit<DomaineProfil, 'lexique'> & { lexique: Record<string, LexiqueEntree> | null };

/** Alias conservé pour compatibilité (anciens écrans : `{ id, nom }`). */
export type DomaineActivite = DomaineProfil;

export interface Entreprise {
  id: number;
  clientId: number;
  nom: string;
  email: string;
  telephone?: string;
  adresse?: string;
  memeActivite?: boolean | null;
  createdAt?: string;
}

// ── Unités opérationnelles (lot 1b) ──────────────────────────────────────────
// 1 unité = 1 activité OU 1 labo (1:1). Le composant du domaine (Restaurant, Bar,
// Cuisine, Économat…) porte les libellés d'affichage ; les flags vente/production
// sont propres à l'unité (défaut true). `sourceUniteId` = unité (labo) qui
// l'alimente (arbre : une seule source), `nbDestinations` = unités qu'elle alimente.

/** Résumé du composant de domaine porté par une unité (sous-ensemble de `Composant`). */
export interface UniteComposant {
  id: number;
  code: string;
  libelle: string;
  libellePluriel?: string | null;
  icone?: string | null;
}

/** Champs communs exposés par `GET /api/entreprise/activites` et `GET /api/labo` (mapActivite / mapLabo). */
export interface UniteOperationnelleFields {
  uniteId?: number | null;
  composant?: UniteComposant | null;
  venteActive?: boolean;
  productionActive?: boolean;
  sourceUniteId?: number | null;
  nbDestinations?: number;
}

/** Ligne de `GET /api/entreprise/unites` (unitesOperationnellesService.listUnites). */
export interface UniteOperationnelle {
  id: number;
  typeTechnique: 'activite' | 'labo';
  activiteId: number | null;
  laboId: number | null;
  nom: string;
  composant: UniteComposant | null;
  venteActive: boolean;
  productionActive: boolean;
  sourceUniteId: number | null;
  sourceNom?: string | null;
  nbDestinations: number;
}

export interface Activite extends UniteOperationnelleFields {
  id: number;
  entrepriseId: number;
  nom: string;
  type?: string;
  adresse?: string;
  telephone?: string;
  email?: string;
  laboId?: number | null;
  laboNom?: string | null;
  laboTel?: string | null;
  laboAdresse?: string | null;
  ingredientCount?: number;
  createdAt?: string;
}

export interface Labo extends UniteOperationnelleFields {
  id: number;
  entrepriseId: number;
  nom: string;
  refLabo: string | null;
  referentTel: string;
  adresse?: string | null;
  createdAt?: string;
  fournisseurCount?: number;
  ingredientCount?: number;
  /** Labo source (« Alimenté par ») — colonne labos.labo_parent_id (lot 1b), si exposée. */
  laboParentId?: number | null;
}

export interface ActiviteTypesSummary {
  hasActivites: boolean;
  hasSelections: boolean;
  hasReady: boolean;
  hasAppro: boolean;
  hasFournisseurs: boolean;
  hasLaboIngredients: boolean;
  hasArticles: boolean;
  /** Lot 1b (flags par unité) — absents tant que le backend ne les expose pas : repli sur hasActivites. */
  hasActivitesVente?: boolean;
  hasLabosProduction?: boolean;
  hasLabosEnfants?: boolean;
}

export interface StockEntry {
  ingredientId: number;        // negative = PT product (-produitId)
  produitId?: number;          // set for PT rows
  isPT?: boolean;
  origine?: string | null;     // PT: 'labo' = reçu par transfert uniquement (pas d'appro manuel côté activité) | 'activite'
  prixCalcule?: number | null; // PT: auto-calculated price from recipe
  prixPartiel?: boolean;       // PT: true if any recipe ingredient has no price
  coutTotal?: number | null;
  coutTotalTTC?: number | null;
  nom: string;
  unite: string;
  categorie: string;
  prixUnitaire: number | null;
  quantite: number | null;
  totalQuantite: number | null;
  dateAppro: string | null;
  updatedAt: string | null;
  seuilMin: number | null;
  lastFournisseurId?: number | null;
  lastRefFacture?: string | null;
  lastTypeAppro?: string | null;
  lastInvDate?: string | null;
  lastInvQty?: number | null;
  lastTauxTva?: number | null;
  pertesDepuisInv?: number | null;
  ptUsageDepuisInv?: number | null;
  venteDepuisInv?: number | null;
  transfertsDepuisAppro?: number | null;
  approDepuisInv?: number | null;
  transfertsDepuisInv?: number | null;
}

export interface StockHistoryEntry {
  dateAppro: string;
  quantite: number | null;
  prixUnitaire: number | null;
  updatedAt: string | null;
  typeAppro: string;
  fournisseurNom: string | null;
  refFacture: string | null;
  tauxTva?: number | null;
  prixUnitaireTva?: number | null;
}

export interface HistoriqueApproEntry {
  id: number;
  activiteId?: number | null;
  dateAppro: string;
  quantite: number | null;
  prixUnitaire: number | null;
  updatedAt: string | null;
  ingredientId: number;
  ingredientNom: string;
  uniteNom: string;
  categorieNom: string;
  typeAppro: string;
  fournisseurId?: number | null;
  fournisseurNom: string | null;
  refFacture: string | null;
  createdBy?: number | null;
  createdByNom?: string | null;
  tauxTva?: number | null;
  prixUnitaireTva?: number | null;
}

export interface FournisseurApproActivite {
  activiteId: number;
  nom: string;
  count: number;
}

export interface Fournisseur {
  id: number;
  nom: string;
  adresse: string | null;
  telephone: string | null;
  isLabo?: boolean;
  activiteIds: number[];
  laboIds: number[];
  createdAt?: string;
  hasAppros?: boolean;
  approCount?: number;
  approByActivite?: FournisseurApproActivite[];
}

export interface LaboStockRow {
  ingredientId: number;
  nom: string;
  unite: string;
  categorie: string;
  quantite: number | null;
  prixUnitaire: number | null;
  dateAppro: string | null;
  seuilMin: number | null;
  totalTransfere: number;
}

export interface Perte {
  id: number;
  ingredientId: number;
  ingredientNom: string;
  uniteNom: string;
  quantite: number;
  typePerte: string; // code du domaine (regles.types_perte) — défaut 'avarie' | 'dechet'
  datePerte: string;
  createdAt: string;
}

export interface ActiviteIngredient {
  id: number;
  nom: string;
  unite: string;
  categorie: string;
  categorieId: number | null;
  familleId: number | null;
  familleNom: string | null;
  prixUnitaire: number | null;
  selected: boolean;
}

export interface ApiError {
  message: string;
  statusCode?: number;
}

export interface HistoriquePerteEntry {
  id: number;
  activiteId?: number | null;
  activiteNom?: string | null;
  ingredientId: number;
  ingredientNom: string;
  uniteNom: string;
  categorieNom: string | null;
  quantite: number;
  prixUnitaire?: number | null;
  typePerte: string; // code du domaine (regles.types_perte) — défaut 'avarie' | 'dechet'
  datePerte: string;
  createdAt: string;
  createdBy?: number | null;
  createdByNom?: string | null;
}

export interface ProduitTransformeStockEntry {
  produitId: number;
  nom: string;
  totalQuantite: number | null;
  lastDateAppro: string | null;
  lastPrixCalcule: number | null;
  seuilMin: number | null;
  prixPartiel: boolean;
}

export interface ProduitTransformeHistoryEntry {
  id: number;
  produitId: number;
  dateAppro: string;
  quantite: number | null;
  prixCalcule: number | null;
  createdAt: string;
}

// ── Transferts entre unités (lot 1b, F2) ─────────────────────────────────────
// Clé de destination partagée par toutes les pages labo : 'a-<activiteId>' | 'l-<laboId>'.
export type DestType = 'activite' | 'labo';

export interface Destination {
  destKey: string;
  type: DestType;
  id: number;
  nom: string;
}

/** Ligne de labo_transfers telle que renvoyée par GET /api/labo/:id/transfers. */
export interface Transfert {
  id: number;
  quantite: number;
  dateTransfert: string;
  note: string | null;
  refFacture: string | null;
  prixUnitaire: number | null;
  tauxTva: number | null;
  prixUnitaireTva: number | null;
  ingredientId: number;          // négatif = produit transformé (-produitId)
  ingredientNom: string;
  uniteNom: string;
  categorieNom: string;
  activiteId: number | null;     // destination activité (flux historique)
  activiteNom: string | null;
  laboDestId?: number | null;    // destination labo (lot 1b)
  destType?: DestType | null;
  destNom?: string | null;
  sens?: 'entree' | 'sortie' | null;
  contrepartieNom?: string | null;
  createdBy?: number | null;
  createdByNom?: string | null;
}
