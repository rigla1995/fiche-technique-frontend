// Comptes d'achat du dossier « Mon entreprise » (F4, factures fournisseur → LabFlow Compta) : où le pont impute les
// achats des factures venues de LabFlow — par catégorie, par article, et pour les frais hors stock. Sans réglage, le
// compte par défaut (d'après la famille : 601 ingrédients, 607 revendu en l'état, 6022 fournitures ; 6241, 4096, 604, 606).
import api from '../api/client';
import type { CompteCourt, JournauxReponse } from './journaux';

/** Compte par défaut : peut manquer au plan (id null, non imputable). */
export interface CompteDefaut { id: number | null; numero: string; libelle: string; imputable: boolean }
export interface CategorieAchat { id: number; nom: string; famille: string | null; nbArticles: number; defaut: CompteDefaut; compte: CompteCourt | null }
export interface ArticleAchat { id: number; nom: string; unite: string | null; categorieId: number | null; compte: CompteCourt | null }
export interface NatureAchat { valeur: string; libelle: string; defaut: CompteDefaut; compte: CompteCourt | null }
export interface ComptesAchatReponse {
  dossier: JournauxReponse['dossier'];
  droits: JournauxReponse['droits'];
  etatAbonnement: JournauxReponse['etatAbonnement'];
  categories: CategorieAchat[];
  articles: ArticleAchat[];
  natures: NatureAchat[];
  comptes: CompteCourt[];
}
export type CibleAchat = { type: 'categorie' | 'article'; id: number } | { type: 'nature'; valeur: string };

const chemin = (dossierId: number | string) => `/api/compta/dossiers/${encodeURIComponent(String(dossierId))}/comptes-achat`;
export const lireComptesAchat = async (dossierId: number | string): Promise<ComptesAchatReponse> => (await api.get(chemin(dossierId))).data;
/** Règle le compte d'une cible ; `compteId` null : retour au compte par défaut. → l'état à jour. */
export const reglerCompteAchat = async (dossierId: number, cible: CibleAchat, compteId: number | null): Promise<ComptesAchatReponse> =>
  (await api.put(chemin(dossierId), { ...cible, compteId })).data;
