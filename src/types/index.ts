export interface User {
  id: number;
  name: string;
  email: string;
  role: 'super_admin' | 'client';
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
}

export interface Client {
  id: number;
  name: string;
  email: string;
  phone?: string;
  createdAt?: string;
}

export interface ApiError {
  message: string;
  statusCode?: number;
}
