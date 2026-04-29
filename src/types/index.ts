export interface User {
  id: number;
  name: string;
  email: string;
  role: 'super_admin' | 'client';
  compteType?: 'independant' | 'entreprise';
  onboardingStep?: number;
  phone?: string;
  entrepriseName?: string | null;
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
}

export interface Ingredient {
  id: number;
  name: string;
  price: number | null;
  clientPrice: number | null;
  effectivePrice: number | null;
  selected?: boolean;
  unit: Unit;
  unitId: number;
  categorieId?: number | null;
  categorieName?: string | null;
}

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
  userId: number;
  activiteId?: number | null;
  activiteType?: 'franchise' | 'distincte' | null;
  franchiseGroup?: string | null;
  createdAt?: string;
}

export interface Client {
  id: number;
  name: string;
  email: string;
  phone?: string;
  compteType?: 'independant' | 'entreprise';
  onboardingStep?: number;
  createdAt?: string;
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
  adresse?: string;
  telephone?: string;
  email?: string;
  type?: 'franchise' | 'distincte';
  franchiseGroup?: string | null;
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
  franchiseGroup: string | null;
  nom: string;
  refLabo: string | null;
  referentTel: string;
  adresse?: string | null;
  createdAt?: string;
}

export interface ActiviteTypesSummary {
  hasFranchise: boolean;
  hasDistinct: boolean;
  hasFranchiseSelections: boolean;
  hasDistinctSelections: boolean;
  hasFranchiseAppro: boolean;
  hasDistinctAppro: boolean;
}

export interface StockEntry {
  ingredientId: number;
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
  prix: number | null;
  prixUnitaire: number | null;
  selected: boolean;
}

export interface ApiError {
  message: string;
  statusCode?: number;
}
