import api from '../api/client';
import type { Droits, EspaceDossiers, EtatAbonnement, EtatDossier, Tva } from './dossiers';
import type { CompteCourt } from './journaux';

// LabFlow Compta, étape S5b « Les journaux et les codes de taxe » (labflow-reprise/achats-compta/PLAN-S5.md §5 ;
// recherche-fiscale-tunisie.md §1 et §3) : types et aides de la page « Taxes ». Le serveur (src/compta/taxes.js)
// contrôle et décide ; l'écran saisit, propose et affiche. Taux et montants voyagent en TEXTE à 3 décimales (SPEC-SOCLE
// §0) : jamais convertis en nombre pour autre chose que l'affichage. Vocabulaire comptable fixe.

export type TypeTaxe = 'tva' | 'retenue' | 'retenue_tva' | 'timbre' | 'fodec' | 'avance' | 'autre';
export type Assiette = 'ht' | 'ttc' | 'tva' | 'fixe';
export interface Taxe {
  id: number; code: string; libelle: string; type: TypeTaxe; typeLibelle: string;
  taux: string | null; montant: string | null; assiette: Assiette; assietteLibelle: string;
  compteAchat: CompteCourt | null; compteVente: CompteCourt | null; compteImmo: CompteCourt | null;
  origine: 'paquet' | 'ajout'; codeTej: string | null; actif: boolean;
}
// Un code du paquet que le dossier n'a pas encore (« Ajouter depuis le paquet »).
export interface CodePaquet {
  code: string; libelle: string; type: TypeTaxe; typeLibelle: string; taux: string | null; montant: string | null; assiette: Assiette; assietteLibelle: string;
  comptes: { achat: string | null; vente: string | null; immobilisations: string | null };
  copie: 'tous' | 'assujetti' | 'exportateur' | 'jamais'; copieLibelle: string; codeTej: string | null; note: string | null;
}
export interface TaxesReponse {
  dossier: { id: number; nom: string; etat: EtatDossier; source: 'saisi' | 'labflow'; espace: EspaceDossiers };
  droits: Droits;
  regime: { tva: Tva; exportateurTotal: boolean };
  nb: { actifs: number; total: number };
  types: { valeur: TypeTaxe; libelle: string }[];
  assiettes: { valeur: Assiette; libelle: string }[];
  code: { max: number };
  // S7b : les codes d'opération TEJ qu'un code personnalisé peut porter (retenue ; retenue de TVA).
  codesTej: { code: string; libelle: string }[];
  codesTejTva: string[];
  taxes: Taxe[];
  paquet: { pays: string; version: string; libelle: string; codes: CodePaquet[] } | null;
  comptes: CompteCourt[];
  etatAbonnement: EtatAbonnement;
}

export const lireTaxes = async (dossierId: number | string): Promise<TaxesReponse> => {
  const { data } = await api.get(`/api/compta/dossiers/${encodeURIComponent(String(dossierId))}/taxes`);
  return data as TaxesReponse;
};

// Affichage : « 19 % », « 1,5 % », « 1,000 D » (le texte du serveur est seulement lu pour l'affichage).
export const fmtTaux = (taux: string | null) => (taux == null ? '—' : `${Number(taux).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} %`);
export const fmtMontant = (montant: string | null) => (montant == null ? '—' : `${Number(montant).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} D`);
export const valeurTaxe = (t: { assiette: Assiette; taux: string | null; montant: string | null }) => (t.assiette === 'fixe' ? fmtMontant(t.montant) : fmtTaux(t.taux));

// Message d'erreur du code d'un code de taxe, ou null (le serveur revérifie : unicité, code du paquet).
export const controlerCodeTaxe = (code: string, max: number): string | null => {
  const c = code.trim().toUpperCase();
  if (!c) return 'Indiquez le code.';
  if (!/^[A-Z0-9_]+$/.test(c)) return 'Le code ne contient que des lettres, des chiffres et le trait bas.';
  if (c.length < 2 || c.length > max) return `Le code a de 2 à ${max} caractères.`;
  return null;
};
// Un taux (0 à 100) ou un montant (dinar, 3 décimales au plus), tels que saisis (virgule acceptée) : message ou null.
export const controlerTaux = (v: string): string | null => {
  const s = v.trim().replace(',', '.');
  if (!s) return 'Indiquez le taux.';
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(s)) return 'Le taux est un nombre à 3 décimales au plus (ex. 19 ou 1,5).';
  if (Number(s) > 100) return 'Le taux ne dépasse pas 100 %.';
  return null;
};
export const controlerMontant = (v: string): string | null => {
  const s = v.trim().replace(',', '.');
  if (!s) return 'Indiquez le montant.';
  if (!/^\d{1,6}(\.\d{1,3})?$/.test(s)) return 'Le montant est un nombre à 3 décimales au plus (ex. 1 ou 0,600).';
  if (Number(s) <= 0) return 'Le montant est supérieur à zéro.';
  return null;
};
