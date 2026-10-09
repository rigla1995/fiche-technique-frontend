import api from '../api/client';
import { telechargerClasseur } from './classeurs';
import type { Droits, EspaceDossiers, EtatAbonnement, EtatDossier } from './dossiers';
import type { EtatEcriture } from './ecritures';

// LabFlow Compta, étape S7c « Déclaration mensuelle » (labflow-reprise/achats-compta/PLAN-S7.md §2 « S7c », §4 ; réponses
// du client du 09/10 — « ok pour les 9 » : état préparatoire à recopier, salaires à la main, écriture de TVA proposée ;
// question 7 : pas de vente à l'export pour l'instant) : types et appels de la page « Déclaration mensuelle ». Le serveur
// (src/compta/declarations.js) calcule, contrôle et écrit ; l'écran choisit et montre. Montants en TEXTE à 3 décimales.

export interface PeriodeDeclaration { id: number; debut: string; fin: string; etat: 'ouverte' | 'close' }
export interface Echeance { date: string; legale: string; jour: number; reportee: boolean }
export interface LigneDeclaration { cle: string; rubrique: string; libelle: string; montant: string; corrigee?: boolean; saisie?: boolean }
export interface NatureRetenue { cle: string; codeTej: string | null; code: string; libelle: string; taux: string | null; base: string; certifie: string; aCertifier: string; montant: string; nb: number }
export interface CodeTvaDeclaration { id: number; code: string; libelle: string; taux: string | null; collectee: string; deductible: string; deductibleImmo: string; baseVente: string; baseAchat: string }
export interface LigneLiquidation { compteId: number; numero: string; libelle: string; debit: string; credit: string }
export type RaisonLiquidation = 'DEJA' | 'PERIODE_EN_COURS' | 'BROUILLARD' | 'COMPTES' | 'JOURNAL' | 'ECART' | 'RIEN' | 'PAS_DE_PERIODE_OUVERTE';
export interface Signalement { code: string; gravite: 'bloquant' | 'attention' | 'info'; message: string }
export interface DeclarationEnBase {
  id: number; saisies: Record<string, string>; tcl: string | null;
  ecriture: { id: number; numero: string | null; numeroProvisoire: string | null; etat: EtatEcriture; date: string } | null;
  marque: { date: string; le: string; par: string | null; total: string; lignes: LigneDeclaration[] } | null;
  modifieLe: string; modifiePar: string | null;
}
export interface DeclarationReponse {
  dossier: { id: number; nom: string; etat: EtatDossier; source: 'saisi' | 'labflow'; espace: EspaceDossiers };
  droits: Droits;
  exercices: { id: number; debut: string; fin: string; etat: 'ouvert' | 'clos'; periodes: PeriodeDeclaration[] }[];
  exercice: { id: number; debut: string; fin: string; etat: 'ouvert' | 'clos' };
  periode: PeriodeDeclaration; aujourdhui: string; finie: boolean; echeance: Echeance | null;
  tva: {
    collectee: string; deductibleBs: string; deductibleImmo: string; deductible: string; retenuesSubies: string;
    creditReporte: string; resultat: string; aPayer: string; creditAReporter: string; compteCredit: string | null; codes: CodeTvaDeclaration[];
  };
  retenues: { natures: NatureRetenue[]; tva: { code: string; libelle: string; montant: string }[]; total: string; bloquees: { ecritureId: number; reference: string; message: string }[]; brouillard: number };
  collectees: { timbre: { montant: string; nb: number }; fodec: { montant: string; nb: number }; avance: { montant: string; nb: number } };
  tcl: { ca: string; tvaCollectee: string; base: string; assiette: 'ht' | 'ttc'; taux: string; exportateur: boolean; montant: string } | null;
  saisies: { cle: string; libelle: string; montant: string | null }[];
  lignes: LigneDeclaration[]; total: string;
  declaration: DeclarationEnBase | null; ecart: boolean;
  liquidation: { lignes: LigneLiquidation[]; total: string; date: string | null; dateReelle: string | null; possible: boolean; raison: RaisonLiquidation | null };
  historique: { periodeId: number; debut: string; fin: string; etat: 'ouverte' | 'close'; echeance: Echeance | null; marque: { date: string; total: string; par: string | null } | null; ecriture: DeclarationEnBase['ecriture']; preparee: boolean }[];
  signalements: Signalement[];
  nbBrouillard: number;
  regime: { personne: 'morale' | 'physique'; teledeclaration: boolean; tva: string; exportateurTotal: boolean };
  source: string | null;
  etatAbonnement: EtatAbonnement;
}
export interface PropositionReponse { ecriture: { id: number; numeroProvisoire: string; date: string; dateReelle: string | null; reference: string; total: string; lignes: LigneLiquidation[] } }

const chemin = (dossierId: number | string, suite: string) => `/api/compta/dossiers/${encodeURIComponent(String(dossierId))}${suite}`;
export const lireDeclaration = async (dossierId: number | string, periodeId: number | null): Promise<DeclarationReponse> => {
  const { data } = await api.get(chemin(dossierId, '/declaration'), { params: periodeId ? { periode: String(periodeId) } : {} });
  return data as DeclarationReponse;
};
// Préparer : les montants saisis à la main (vide = rien) et la TCL corrigée (vide = calculée).
export const preparerDeclaration = async (dossierId: number, periodeId: number, saisies: Record<string, string>, tcl: string) => {
  const { data } = await api.put(chemin(dossierId, `/declaration/${periodeId}`), { saisies, tcl });
  return data as { prepare: { periodeId: number; saisies: Record<string, string>; tcl: string | null } };
};
export const proposerEcritureTva = async (dossierId: number, periodeId: number): Promise<PropositionReponse> => {
  const { data } = await api.post(chemin(dossierId, `/declaration/${periodeId}/ecriture-tva`));
  return data as PropositionReponse;
};
// Marquer comme déclarée : la date du dépôt et le total montré à la confirmation (409 s'il a changé).
export const marquerDeclaration = async (dossierId: number, periodeId: number, date: string, attendu: string) => {
  const { data } = await api.post(chemin(dossierId, `/declaration/${periodeId}/marquer`), { date, attendu });
  return data as { marque: { periodeId: number; date: string; total: string } };
};
export const demarquerDeclaration = async (dossierId: number, periodeId: number) => {
  const { data } = await api.post(chemin(dossierId, `/declaration/${periodeId}/demarquer`));
  return data as { demarque: { periodeId: number } };
};
// Nom de repli (le navigateur ne lit pas toujours l'en-tête de la réponse) : « declaration-2026-09.xlsx ».
export const telechargerDeclarationExcel = (dossierId: number, periodeId: number, mois: string) =>
  telechargerClasseur(`${chemin(dossierId, '/declaration/export')}?periode=${periodeId}`, `declaration-${mois}.xlsx`);
export const telechargerDeclarationPdf = (dossierId: number, periodeId: number, mois: string) =>
  telechargerClasseur(`${chemin(dossierId, '/declaration/pdf')}?periode=${periodeId}`, `declaration-${mois}.pdf`, 'application/pdf');

// Pourquoi l'écriture de TVA ne se propose pas (texte de l'écran ; le serveur dit le sien en cas de refus).
export const RAISONS_LIQUIDATION: Record<RaisonLiquidation, string> = {
  DEJA: 'L\'écriture de liquidation de ce mois existe déjà.',
  PERIODE_EN_COURS: 'Le mois n\'est pas fini : la TVA se liquide après la fin de la période.',
  BROUILLARD: 'La période porte des écritures en brouillard : validez-les ou supprimez-les d\'abord (page Écritures).',
  COMPTES: 'Compte du crédit de TVA ou de la TVA à payer absent du plan du dossier.',
  JOURNAL: 'Aucun journal des opérations diverses actif dans ce dossier (page Journaux).',
  ECART: 'Les comptes de TVA ne rejoignent pas l\'état de TVA du mois : vérifiez les codes de taxe des écritures.',
  RIEN: 'Aucune TVA à liquider ce mois-ci.',
  PAS_DE_PERIODE_OUVERTE: 'La période est close et aucune période ouverte ne la suit : rouvrez-la ou ouvrez l\'exercice suivant.',
};
