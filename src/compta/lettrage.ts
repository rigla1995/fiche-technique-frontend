import api from '../api/client';
import type { Droits, EspaceDossiers, EtatAbonnement, EtatDossier } from './dossiers';
import type { EtatEcriture, TiersCourt } from './ecritures';
import { versMillimes } from './ecritures';

// LabFlow Compta, étape S7a « Lettrage, échéancier, relevés » (labflow-reprise/achats-compta/PLAN-S7.md §2 « S7a », §4
// « Lettrage » ; réponses du client du 09/10 — « ok pour les 9 » : seules les lignes d'écritures validées se lettrent, une
// lettre = somme nulle) : types et appels de la page « Lettrage ». Le serveur (src/compta/lettrage.js) contrôle et décide
// (même compte, écart nul, lettre suivante AAA → ZZZ, journal) ; l'écran choisit le tiers, coche, montre le pied et les
// propositions. Montants en TEXTE à 3 décimales (SPEC-SOCLE §0) : le pied se calcule en millimes entiers (bigint).

// Un tiers mouvementé, tel que la page le propose (compatible avec ChoixTiers) : ses lignes validées à lettrer, en
// brouillard, lettrées.
export interface TiersLettrage extends TiersCourt { actif: boolean; nbALettrer: number; nbBrouillard: number; nbLettrees: number }
export interface LettrageReponse {
  dossier: { id: number; nom: string; etat: EtatDossier; source: 'saisi' | 'labflow'; espace: EspaceDossiers };
  droits: Droits;
  tiers: TiersLettrage[];
  nb: { aLettrer: number; brouillard: number; lettres: number };
  bornes: { lignesMax: number; lettresMax: number };
  etatAbonnement: EtatAbonnement;
}
export interface LigneALettrer {
  id: number; date: string; dateReelle: string | null; rang: number; libelle: string; debit: string; credit: string; echeance: string | null;
  compte: { id: number; numero: string; libelle: string };
  ecriture: { id: number; numero: string | null; numeroProvisoire: string; etat: EtatEcriture; reference: string; libelle: string; origine: string; journal: string };
}
export interface Lettre { id: number; lettre: string; montant: string; nbLignes: number; compte: { id: number; numero: string }; creePar: string | null; creeLe: string; lignes: LigneALettrer[] }
// S7a (relecture) : « contrepassation » — une écriture contre-passée avec sa contre-passation, proposée en premier.
export interface Proposition { motif: 'contrepassation' | 'piece' | 'montant'; piece: string | null; lignes: number[]; montant: string }
export interface TiersLettrageReponse {
  tiers: { id: number; type: 'fournisseur' | 'client'; typeLibelle: string; code: string; nom: string; actif: boolean; delaiPaiement: number; compteId: number };
  lignes: LigneALettrer[]; total: number;
  totaux: { nb: number; nbALettrer: number; nbBrouillard: number; debit: string; credit: string; solde: string; soldeDebit: string; soldeCredit: string };
  lettres: Lettre[]; nbLettres: number;
  propositions: Proposition[];
  // Rendus par lettrer / délettrer.
  faites?: { id: number; lettre: string; montant: string; nbLignes: number }[];
  defaite?: { id: number; lettre: string; montant: string };
}

const chemin = (dossierId: number | string, suite = '') => `/api/compta/dossiers/${encodeURIComponent(String(dossierId))}/lettrage${suite}`;
export const lireLettrage = async (dossierId: number | string): Promise<LettrageReponse> => {
  const { data } = await api.get(chemin(dossierId));
  return data as LettrageReponse;
};
export const lireTiersLettrage = async (dossierId: number, tiersId: number): Promise<TiersLettrageReponse> => {
  const { data } = await api.get(chemin(dossierId, `/tiers/${tiersId}`));
  return data as TiersLettrageReponse;
};
// Une lettre (les lignes cochées) ou plusieurs (une par groupe : « Lettrer les propositions »).
export const lettrer = async (dossierId: number, tiersId: number, groupes: number[][]): Promise<TiersLettrageReponse> => {
  const { data } = await api.post(chemin(dossierId), { tiersId, groupes });
  return data as TiersLettrageReponse;
};
export const delettrer = async (dossierId: number, lettrageId: number): Promise<TiersLettrageReponse> => {
  const { data } = await api.delete(chemin(dossierId, `/${lettrageId}`));
  return data as TiersLettrageReponse;
};

// Le pied d'une sélection : total coché au débit, au crédit, écart (débits − crédits), en millimes.
export const piedSelection = (lignes: LigneALettrer[], cochees: Set<number>) => {
  let debit = 0n;
  let credit = 0n;
  for (const l of lignes) {
    if (!cochees.has(l.id)) continue;
    debit += versMillimes(l.debit) ?? 0n;
    credit += versMillimes(l.credit) ?? 0n;
  }
  return { debit, credit, ecart: debit - credit };
};
// Les comptes des lignes cochées (une lettre se fait sur un seul compte collectif).
export const comptesCoches = (lignes: LigneALettrer[], cochees: Set<number>) => [...new Set(lignes.filter((l) => cochees.has(l.id)).map((l) => l.compte.numero))];
export const LIBELLES_MOTIF: Record<Proposition['motif'], string> = { contrepassation: 'Contre-passation', piece: 'Même pièce', montant: 'Même montant' };
