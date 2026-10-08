import api from '../api/client';
import type { Droits, EspaceDossiers, EtatAbonnement, EtatDossier } from './dossiers';

// LabFlow Compta, étape S5a « Le paquet Tunisie et le plan de comptes » (labflow-reprise/achats-compta/PLAN-S5.md) :
// types et aides de la page « Plan de comptes ». Le serveur (src/compta/planComptes.js) contrôle et décide ; l'écran
// saisit, propose et affiche. Vocabulaire comptable fixe.

export interface Compte {
  id: number; numero: string; libelle: string; classe: number; parentId: number | null; nature: string;
  origine: 'paquet' | 'ajout'; libellePaquet: string | null; note: string | null; explication: string | null; actif: boolean;
  nbEnfants: number; nbEnfantsActifs: number; feuille: boolean; renomme: boolean;
}
export interface Paquet { pays: string; version: string; libelle: string }
export interface PlanReponse {
  dossier: { id: number; nom: string; etat: EtatDossier; source: 'saisi' | 'labflow'; espace: EspaceDossiers };
  droits: Droits;
  paquet: Paquet | null;
  nb: { total: number; actifs: number; ajoutes: number; desactives: number };
  natures: { valeur: string; libelle: string }[];
  numero: { min: number; max: number };
  comptes: Compte[];
  etatAbonnement: EtatAbonnement;
}

export const lirePlan = async (dossierId: number | string): Promise<PlanReponse> => {
  const { data } = await api.get(`/api/compta/dossiers/${encodeURIComponent(String(dossierId))}/plan`);
  return data as PlanReponse;
};

// Les sept classes de la nomenclature NC 01 (3ᵉ partie).
export const CLASSES: { numero: number; libelle: string }[] = [
  { numero: 1, libelle: 'Comptes de capitaux propres et passifs non courants' },
  { numero: 2, libelle: 'Comptes d\'actifs non courants' },
  { numero: 3, libelle: 'Comptes de stocks' },
  { numero: 4, libelle: 'Comptes de tiers' },
  { numero: 5, libelle: 'Comptes financiers' },
  { numero: 6, libelle: 'Comptes de charges' },
  { numero: 7, libelle: 'Comptes de produits' },
];

// Sous-comptes par parent (null = comptes à 2 chiffres), dans l'ordre reçu (numéros croissants).
export const enfantsParParent = (comptes: Compte[]): Map<number | null, Compte[]> => {
  const m = new Map<number | null, Compte[]>();
  for (const c of comptes) {
    const liste = m.get(c.parentId);
    if (liste) liste.push(c); else m.set(c.parentId, [c]);
  }
  return m;
};

// Numéro proposé pour une subdivision : le parent prolongé du plus petit chiffre libre (1 à 9, puis 0) parmi ses
// sous-comptes d'un chiffre de plus ; tous pris : deux chiffres.
export const numeroPropose = (parent: Compte, comptes: Compte[]): string => {
  const pris = new Set(comptes.filter((c) => c.numero.length === parent.numero.length + 1 && c.numero.startsWith(parent.numero)).map((c) => c.numero.slice(-1)));
  for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']) if (!pris.has(d)) return parent.numero + d;
  return `${parent.numero}10`;
};

// Message d'erreur du numéro d'une subdivision, ou null (le serveur revérifie : vrai parent, unicité).
export const controlerNumero = (numero: string, parent: Compte, min: number, max: number): string | null => {
  const n = numero.replace(/\s/g, '');
  if (!/^\d+$/.test(n)) return 'Le numéro ne contient que des chiffres.';
  if (n.length < min || n.length > max) return `Le numéro a de ${min} à ${max} chiffres.`;
  if (!n.startsWith(parent.numero) || n.length <= parent.numero.length) return `Le numéro commence par ${parent.numero} et le prolonge d'au moins un chiffre.`;
  return null;
};

// Recherche : par début de numéro, ou par mot du libellé (sans accents ni casse). `libelleNormalise` : le libellé déjà
// normalisé (calculé une fois par plan par la page), sinon il l'est ici.
export const normaliser = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const correspond = (c: Compte, q: string, libelleNormalise?: string): boolean => {
  const t = q.trim();
  if (!t) return true;
  if (/^\d+$/.test(t)) return c.numero.startsWith(t);
  return (libelleNormalise ?? normaliser(c.libelle)).includes(normaliser(t));
};

// Téléchargement du plan (classeur à la charte), nom du fichier lu dans la réponse.
export const telechargerPlan = async (dossierId: number, nomDossier: string) => {
  const res = await api.get(`/api/compta/dossiers/${dossierId}/plan/export`, { responseType: 'blob' });
  const cd = (res.headers['content-disposition'] as string | undefined) || '';
  const m = cd.match(/filename="?([^"]+)"?/);
  const nom = m ? m[1] : `plan-de-comptes-${nomDossier.replace(/[^\w-]+/g, '_')}.xlsx`;
  const url = window.URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', nom);
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};
