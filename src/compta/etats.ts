import api from '../api/client';
import { telechargerClasseur } from './classeurs';
import type { Droits, EspaceDossiers, EtatAbonnement, EtatDossier } from './dossiers';
import type { ReportProvisoire } from './livres';

// LabFlow Compta, étape E1 « Le bilan et l'état de résultat » (labflow-reprise/achats-compta/PLAN-ETATS-FINANCIERS.md §2
// ligne E1, §3 ; réponses du client du 14/10 — « ok pour les 5 » : état de résultat par nature, colonne N−1 calculée,
// correspondance fixe du paquet) : types et appels de la page « États financiers ». Le serveur (src/compta/etats.js)
// calcule et décide ; l'écran choisit (exercice, brouillard compris) et montre. Montants en TEXTE signé à 3 décimales
// (SPEC-SOCLE §0) : actif et passif en plus, déductions « moins » en plus, état de résultat produits en plus et charges en
// moins. Vocabulaire comptable fixe.

export interface ExerciceEtats { id: number; debut: string; fin: string; etat: 'ouvert' | 'clos'; millesime: number }
export interface CompteEtat { id: number; numero: string; libelle: string; n: string; n1: string }
export interface Montants { n: string; n1: string }
export interface TotalEtat extends Montants { libelle: string }
export interface PosteBilan extends Montants {
  code: string; libelle: string;
  // Postes calculés : le sous-total des capitaux propres avant résultat, le résultat de l'exercice (sans comptes).
  calcul?: 'sousTotal' | 'resultat';
  comptes?: CompteEtat[];
  moins?: (Montants & { libelle: string; comptes: CompteEtat[] }) | null;
  net?: Montants;
}
export interface RubriqueBilan { code: string; libelle: string | null; postes: PosteBilan[]; total: TotalEtat | null }
export interface GroupeBilan { code: string; libelle: string; rubriques: RubriqueBilan[]; total: TotalEtat | null }
export interface CoteBilan { groupes: GroupeBilan[]; total: TotalEtat }
export type LigneResultat = { titre: string; code?: undefined } | (Montants & { code: string; libelle: string; calcul?: 'total'; comptes?: CompteEtat[]; titre?: undefined });
export interface ControleEtat { code: string; libelle: string; ok: boolean; detail: string }
export interface EtatsReponse {
  dossier: { id: number; nom: string; etat: EtatDossier; source: 'saisi' | 'labflow'; espace: EspaceDossiers };
  droits: Droits;
  etatAbonnement: EtatAbonnement;
  exercices: ExerciceEtats[];
  exercice: ExerciceEtats & { fini: boolean; clos: { le: string; resultat: string } | null };
  precedent: ExerciceEtats | null;
  selection: { exercice: number; brouillard: boolean };
  // NC 01 §19 : les mentions de chaque page — entreprise, matricule, arrêté (ou situation provisoire), unité ; les titres
  // des deux colonnes.
  entete: { entreprise: string; nom: string; matricule: string | null; forme: string | null; arrete: string; provisoire: boolean; unite: string; colonnes: { n: string; n1: string } };
  brouillard: { nb: number; compris: boolean };
  provisoire: { report: ReportProvisoire | null };
  bilan: { actifs: CoteBilan; passifs: CoteBilan };
  resultat: { lignes: LigneResultat[]; net: Montants };
  controles: ControleEtat[];
  pret: boolean;
  sansPoste: { id: number; numero: string; libelle: string; solde: string }[];
}
export interface ParametresEtats { exerciceId?: number | null; brouillard?: boolean }

const chemin = (dossierId: number | string, suite = '') => `/api/compta/dossiers/${encodeURIComponent(String(dossierId))}/etats${suite}`;
const params = (p: ParametresEtats) => {
  const q: Record<string, string> = {};
  if (p.exerciceId) q.exercice = String(p.exerciceId);
  if (p.brouillard) q.brouillard = '1';
  return q;
};
export const lireEtats = async (dossierId: number | string, p: ParametresEtats = {}): Promise<EtatsReponse> => {
  const { data } = await api.get(chemin(dossierId), { params: params(p) });
  return data as EtatsReponse;
};
// Le PDF (bilan, état de résultat) de la sélection en cours ; nom de repli si le navigateur ne lit pas l'en-tête.
export const telechargerEtatsPdf = (dossierId: number, p: ParametresEtats) => {
  const q = new URLSearchParams(params(p)).toString();
  return telechargerClasseur(`${chemin(dossierId, '.pdf')}${q ? `?${q}` : ''}`, `etats-financiers-${dossierId}.pdf`, 'application/pdf');
};
