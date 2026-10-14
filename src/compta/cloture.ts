import api from '../api/client';
import type { Droits, EspaceDossiers, EtatAbonnement, EtatDossier } from './dossiers';
import type { Ecriture } from './ecritures';

// LabFlow Compta, étape X2 « La clôture de l'exercice » (labflow-reprise/achats-compta/PLAN-EXERCICES.md §2 ligne X2, §3 ;
// réponses du client du 13/10 — « ok pour les 5 » : exercice clos définitif, affectation du résultat préparée en brouillard) :
// types et appels de l'assistant « Clôturer l'exercice ». Le serveur (src/compta/cloture.js) contrôle et décide ; l'écran
// montre et demande. Montants en TEXTE à 3 décimales (SPEC-SOCLE §0). Vocabulaire comptable fixe.

export interface ExerciceCourt { id: number; debut: string; fin: string; etat: 'ouvert' | 'clos'; millesime: number }
export interface Controle { code: string; libelle: string; ok: boolean; detail: string }
export interface LigneApercu { compte: { id: number; numero: string; libelle: string }; tiers: { id: number; code: string; nom: string } | null; debit: string; credit: string }
export interface EcritureApercu { journal: string; date: string; reference: string; libelle: string; lignes: LigneApercu[]; total: string }
export interface CompteAffectation { id: number; numero: string; libelle: string; usage: 'benefice' | 'tous' }
export interface ClotureReponse {
  dossier: { id: number; nom: string; etat: EtatDossier; source: 'saisi' | 'labflow'; espace: EspaceDossiers };
  droits: Droits;
  etatAbonnement: EtatAbonnement;
  // L'exercice de l'assistant : fini (date de fin passée) ; clos — qui, quand, résultat (positif = bénéfice).
  exercice: ExerciceCourt & { fini: boolean; clos: { le: string; par: string | null; resultat: string } | null };
  suivant: ExerciceCourt | null;
  precedent: ExerciceCourt | null;
  // Exercice ouvert : les contrôles (tous au vert = prêt) et l'aperçu des deux écritures ; exercice clos : vides.
  controles: Controle[];
  pret: boolean;
  resultat: { charges: string; produits: string; resultat: string; benefice: boolean; compte: { id: number; numero: string; libelle: string } | null; numeroCompte: string };
  apercu: { resultat: EcritureApercu; anouveaux: EcritureApercu } | null;
  // Exercice clos : les écritures passées (null si rien à passer : résultat nul, tout soldé).
  ecritures: { resultat: Ecriture | null; anouveaux: Ecriture | null } | null;
  // L'affectation du résultat : possible (clos, résultat non nul, pas encore préparée, exercice suivant ouvert), les
  // comptes proposés (du paquet, imputables), l'écriture préparée (brouillard), la date proposée.
  affectation: { possible: boolean; resultat: string; benefice: boolean; compte: { id: number; numero: string; libelle: string } | null; comptes: CompteAffectation[]; ecriture: Ecriture | null; dateProposee: string | null };
}
export interface PartAffectation { compteId: number; montant: string }

const chemin = (dossierId: number | string, exerciceId: number | string, suite = '') => `/api/compta/dossiers/${encodeURIComponent(String(dossierId))}/exercices/${encodeURIComponent(String(exerciceId))}${suite}`;
export const lireCloture = async (dossierId: number | string, exerciceId: number | string): Promise<ClotureReponse> => {
  const { data } = await api.get(chemin(dossierId, exerciceId, '/cloture'));
  return data as ClotureReponse;
};
// Clôturer (titulaire seul) : définitif.
export const cloturerExercice = async (dossierId: number, exerciceId: number): Promise<ClotureReponse> => {
  const { data } = await api.post(chemin(dossierId, exerciceId, '/cloturer'), {});
  return data as ClotureReponse;
};
// Préparer l'affectation du résultat en brouillard (titulaire, Complet).
export const affecterResultat = async (dossierId: number, exerciceId: number, corps: { date?: string; lignes: PartAffectation[] }): Promise<ClotureReponse> => {
  const { data } = await api.post(chemin(dossierId, exerciceId, '/affectation'), corps);
  return data as ClotureReponse;
};

export const LIBELLES_CONTROLES_ORDRE = ['brouillard', 'periodes', 'equilibre', 'tiers', 'precedent', 'suivant', 'journalOD', 'journalAN', 'compteResultat'];
