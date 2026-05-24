export interface User {
  id: number;
  name: string;
  email: string;
  role: 'super_admin' | 'client' | 'gerant';
  onboardingStep?: number;
  phone?: string;
  entrepriseName?: string | null;
  modeCompte?: 'actif' | 'read_only' | 'desactive' | 'archive' | 'bloque';
  prolongationJours?: number;
  gerantParentId?: number;
  gerantActiviteId?: number;
  gerantActiviteType?: 'labo' | 'activite';
  gerantActiviteNom?: string | null;
  activitesCount?: number;
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
  statutPromo: 'actif' | 'expiré';
}

export interface AbonnementConfig {
  id: number;
  abonnementId: number;
  nbActivites: number;
  nbLabos: number;
  nbGerants: number;
  montantOnboarding: number;
  createdAt: string;
  updatedAt: string;
}


export interface Abonnement {
  id: number;
  clientId: number;
  clientNom: string;
  clientEmail: string;
  compteType?: 'independant' | 'entreprise' | null;
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
      activite: { nb: number; total: number };
      labo:     { nb: number; total: number };
      gerant:   { nb: number; total: number };
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
  [cle: string]: { id: number; valeur: number; description: string };
}

export interface Demande {
  id: number;
  demandeurId: number;
  demandeurNom: string;
  demandeurType: string;
  typeDemande: 'gerant_sup' | 'labo_sup' | 'upgrade_entreprise' | 'activer_module_vente';
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
}

export interface Category {
  id: number;
  name: string;
  familleId?: number | null;
  familleName?: string | null;
  clientId?: number | null;
}

export interface Famille {
  id: number;
  name: string;
  consommable: boolean;
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
  ingredients: ProductIngredient[];
  subProducts: ProductComponent[];
  totalCost: number;
  ingredientsCount?: number;
  subProductsCount?: number;
  parentProductsCount?: number;
  userId: number;
  activiteId?: number | null;
  activites?: { id: number; nom: string }[];
  createdAt?: string;
  isStockIngredient?: boolean;
  isSupplement?: boolean;
  refProduit?: string | null;
}

export interface Client {
  id: number;
  name: string;
  email: string;
  phone?: string;
  compteType?: 'independant' | 'entreprise' | null;
  onboardingStep?: number;
  createdAt?: string;
  activatedAt?: string | null;
  domaineIds?: number[];
}

export interface DomaineActivite {
  id: number;
  nom: string;
}

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

export interface Activite {
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

export interface Labo {
  id: number;
  entrepriseId: number;
  nom: string;
  refLabo: string | null;
  referentTel: string;
  adresse?: string | null;
  createdAt?: string;
  fournisseurCount?: number;
}

export interface ActiviteTypesSummary {
  hasActivites: boolean;
  hasSelections: boolean;
  hasReady: boolean;
  hasAppro: boolean;
  hasFournisseurs: boolean;
  hasLaboIngredients: boolean;
  hasArticles: boolean;
}

export interface StockEntry {
  ingredientId: number;        // negative = PT product (-produitId)
  produitId?: number;          // set for PT rows
  isPT?: boolean;
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
  pertesDepuisInv?: number | null;
  ptUsageDepuisInv?: number | null;
  transfertsDepuisAppro?: number | null;
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
  typePerte: 'avarie' | 'dechet';
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
  typePerte: 'avarie' | 'dechet';
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
