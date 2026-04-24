export interface User {
  id: number;
  name: string;
  email: string;
  role: 'super_admin' | 'client';
  compteType?: 'independant' | 'entreprise';
  onboardingStep?: number;
  phone?: string;
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
  createdAt?: string;
}

export interface ActiviteTypesSummary {
  hasFranchise: boolean;
  hasDistinct: boolean;
}

export interface StockEntry {
  ingredientId: number;
  nom: string;
  unite: string;
  categorie: string;
  prixUnitaire: number | null;
  quantite: number | null;
  updatedAt: string | null;
}

export interface ActiviteIngredient {
  id: number;
  nom: string;
  unite: string;
  categorie: string;
  prix: number | null;
  prixUnitaire: number | null;
  selected: boolean;
}

export interface ApiError {
  message: string;
  statusCode?: number;
}
