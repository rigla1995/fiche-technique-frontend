import api from '../api/client';
import type { Droits, EspaceDossiers, EtatAbonnement, EtatDossier } from './dossiers';

// LabFlow Compta, étape S5b « Les journaux et les codes de taxe » (labflow-reprise/achats-compta/PLAN-S5.md) : types et
// aides de la page « Journaux ». Le serveur (src/compta/journaux.js) contrôle et décide ; l'écran saisit, propose et
// affiche. Vocabulaire comptable fixe.

// Un compte du plan, en court (choix de contrepartie, compte d'un journal ou d'un code) : « imputable » = actif et sans
// sous-compte actif (feuille) — sinon la page dit « Compte à préciser ».
export interface CompteCourt { id: number; numero: string; libelle: string; nature: string; actif: boolean; feuille: boolean; imputable: boolean }
export type TypeJournal = 'achats' | 'ventes' | 'banque' | 'caisse' | 'od' | 'an';
export interface Journal {
  id: number; code: string; libelle: string; type: TypeJournal; typeLibelle: string; avecCompte: boolean;
  compte: CompteCourt | null; origine: 'paquet' | 'ajout'; actif: boolean;
}
export interface TypeJournalChoix { valeur: TypeJournal; libelle: string; avecCompte: boolean; nature: string | null }
export interface JournauxReponse {
  dossier: { id: number; nom: string; etat: EtatDossier; source: 'saisi' | 'labflow'; espace: EspaceDossiers };
  droits: Droits;
  nb: { actifs: number; total: number };
  types: TypeJournalChoix[];
  code: { max: number };
  journaux: Journal[];
  comptes: CompteCourt[];
  etatAbonnement: EtatAbonnement;
}

export const lireJournaux = async (dossierId: number | string): Promise<JournauxReponse> => {
  const { data } = await api.get(`/api/compta/dossiers/${encodeURIComponent(String(dossierId))}/journaux`);
  return data as JournauxReponse;
};

// Message d'erreur du code d'un journal, ou null (le serveur revérifie : unicité).
export const controlerCodeJournal = (code: string, max: number): string | null => {
  const c = code.trim().toUpperCase();
  if (!c) return 'Indiquez le code du journal.';
  if (!/^[A-Z0-9]+$/.test(c)) return 'Le code ne contient que des lettres et des chiffres.';
  if (c.length < 2 || c.length > max) return `Le code a de 2 à ${max} caractères.`;
  return null;
};

// Code proposé pour un nouveau journal d'un type : le préfixe d'usage (BQ, CA, AC, VT, OD, AN) s'il est libre, sinon
// prolongé du plus petit numéro libre (BQ2, BQ3…).
const PREFIXES: Record<TypeJournal, string> = { achats: 'AC', ventes: 'VT', banque: 'BQ', caisse: 'CA', od: 'OD', an: 'AN' };
export const codePropose = (type: TypeJournal, journaux: Journal[]): string => {
  const pris = new Set(journaux.map((j) => j.code));
  const p = PREFIXES[type];
  if (!pris.has(p)) return p;
  for (let n = 2; n < 100; n++) if (!pris.has(`${p}${n}`)) return `${p}${n}`;
  return '';
};

// Texte court d'un compte : « 5321 — Comptes en dinars ».
export const texteCompte = (c: CompteCourt | null) => (c ? `${c.numero} — ${c.libelle}` : '—');
